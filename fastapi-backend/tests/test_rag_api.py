import os
import sys
import uuid
from unittest.mock import patch

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from fastapi.testclient import TestClient

from app.main import app
from database.session import SessionLocal
from database.models import Student, Document, KnowledgeChunk

client = TestClient(app)
API = "/api/v1"

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def student(db_session):
    s = Student(
        email=f"rag_test_{uuid.uuid4()}@example.com",
        full_name="RAG Test Student",
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)
    
    yield str(s.student_id)
    
    db_session.query(KnowledgeChunk).filter(KnowledgeChunk.student_id == s.student_id).delete(synchronize_session=False)
    db_session.query(Document).filter(Document.student_id == s.student_id).delete(synchronize_session=False)
    db_session.delete(s)
    db_session.commit()

@pytest.fixture
def document(db_session, student):
    doc = Document(
        student_id=uuid.UUID(student),
        filename="test_doc.pdf",
        subject="Physics"
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    yield str(doc.document_id)

def test_create_chunk(student):
    """Test creating a chunk and embedding synchronously"""
    payload = {
        "student_id": student,
        "text_content": "Newton's first law of motion states that an object will remain at rest or in uniform motion in a straight line unless acted upon by an external force.",
        "topic_tags": ["physics", "newton"]
    }
    
    response = client.post(f"{API}/chunks", json=payload)
    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()
    assert "chunk_id" in data
    assert data["student_id"] == student
    assert data["text_content"] == payload["text_content"]
    assert "physics" in data["topic_tags"]

def test_list_chunks(student):
    # First create a chunk
    payload = {
        "student_id": student,
        "text_content": "This is a test chunk for list endpoint.",
        "topic_tags": ["test"]
    }
    client.post(f"{API}/chunks", json=payload)
    
    response = client.get(f"{API}/chunks")
    assert response.status_code == 200
    data = response.json()
    assert "chunks" in data
    assert len(data["chunks"]) > 0

@patch("app.api.routes.process_chunk_embedding.delay")
def test_trigger_embedding(mock_delay, student):
    mock_delay.return_value.id = "fake-task-id"
    payload = {
        "student_id": student,
        "text_content": "Async embedding test.",
        "topic_tags": ["async"]
    }
    response = client.post(f"{API}/process-embedding", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["task_id"] == "fake-task-id"
    assert data["status"] == "queued"
    mock_delay.assert_called_once()

@patch("app.api.routes.process_pdf_task.delay")
def test_upload_pdf(mock_delay, student, tmp_path):
    mock_delay.return_value.id = "fake-pdf-task-id"
    
    # Create a dummy PDF file
    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_text("dummy pdf content")
    
    with open(pdf_path, "rb") as f:
        response = client.post(
            f"{API}/upload-pdf",
            data={"student_id": student, "subject": "Math"},
            files={"file": ("test.pdf", f, "application/pdf")}
        )
        
    assert response.status_code == 200
    data = response.json()
    assert "task_id" in data
    assert data["subject"] == "Math"

def test_get_documents(student, document):
    response = client.get(f"{API}/documents/{student}")
    assert response.status_code == 200
    data = response.json()
    assert "documents" in data
    assert len(data["documents"]) > 0
    assert data["documents"][0]["document_id"] == document
    assert data["documents"][0]["subject"] == "Physics"

def test_delete_document(student, document):
    response = client.delete(f"{API}/documents/{document}")
    assert response.status_code == 200
    
    # Verify deletion
    response2 = client.get(f"{API}/documents/{student}")
    assert len(response2.json()["documents"]) == 0
