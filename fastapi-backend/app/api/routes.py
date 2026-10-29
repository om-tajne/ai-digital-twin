import os
import uuid
import tempfile
import hashlib
import secrets
import logging
import json
import random
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    File,
    UploadFile,
    Form,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session


# ============================================================
# DATABASE
# ============================================================

from database.session import get_db, SessionLocal

from database.models import (
    Student,
    KnowledgeChunk,
    Document,
    StudentMastery,
    MasterySnapshot,
    Test,
    TestQuestion,
)


# ============================================================
# SERVICES
# ============================================================

from app.services.embedding_service import (
    get_embedding_service,
    EmbeddingService,
)

from app.services.mastery_service import (
    update_mastery_score,
)

from app.services.struggle_service import (
    get_top_struggles,
)

from app.services.struggle_data_service import (
    get_struggle_input_data,
)

from app.services.rag_service import (
    retrieve_relevant_chunks,
)

from app.services.llm_service import (
    get_llm_service,
)


# ============================================================
# CELERY
# ============================================================

from worker.celery_app import celery_app

from worker.tasks import (
    process_chunk_embedding,
    process_pdf_task,
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter()


# ============================================================
# PYDANTIC SCHEMAS
# ============================================================


class StudentCreate(BaseModel):
    email: str
    full_name: str
    board: Optional[str] = None
    grade: Optional[str] = None
    guardian_email: Optional[str] = None


class ChunkCreate(BaseModel):
    student_id: str
    text_content: str
    topic_tags: Optional[List[str]] = None


class GenerateEmbeddingRequest(BaseModel):
    text: Optional[str] = None
    texts: Optional[List[str]] = None
    provider: Optional[str] = None


class MasteryUpdateRequest(BaseModel):
    student_id: str
    subject: str
    topic: str
    is_correct: bool


class TestQuestionCreate(BaseModel):
    topic: str
    question_text: str
    correct_answer: str


class TestCreate(BaseModel):
    student_id: str
    title: str
    subject: str
    questions: List[TestQuestionCreate]


class TestAnswer(BaseModel):
    question_id: str
    answer: str


class TestSubmission(BaseModel):
    answers: List[TestAnswer]


class GenerateTestRequest(BaseModel):
    student_id: str
    document_id: Optional[str] = None
    topic: Optional[str] = None
    num_questions: int = 5


# ============================================================
# STUDENT ENDPOINTS
# ============================================================


@router.get("/students")
def list_students(
    db: Session = Depends(get_db),
):
    students = db.query(Student).all()

    return {
        "students": [
            {
                "student_id": str(student.student_id),
                "email": student.email,
                "full_name": student.full_name,
                "board": student.board,
                "grade": student.grade,
                "date_of_birth": (
                    str(student.date_of_birth)
                    if student.date_of_birth
                    else None
                ),
                "guardian_email": student.guardian_email,
                "created_at": student.created_at,
            }
            for student in students
        ]
    }


@router.post("/students")
def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
):
    existing_student = (
        db.query(Student)
        .filter(Student.email == student.email)
        .first()
    )

    if existing_student:
        raise HTTPException(
            status_code=400,
            detail="Student with this email already exists",
        )

    new_student = Student(
        email=student.email,
        full_name=student.full_name,
        board=student.board,
        grade=student.grade,
        guardian_email=student.guardian_email,
    )

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    return {
        "student_id": str(new_student.student_id),
        "email": new_student.email,
        "full_name": new_student.full_name,
        "board": new_student.board,
        "grade": new_student.grade,
        "guardian_email": new_student.guardian_email,
    }


# ============================================================
# MASTERY UPDATE
# ============================================================


@router.post("/mastery/update")
def update_mastery(
    payload: MasteryUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        student_id = uuid.UUID(payload.student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    mastery = update_mastery_score(
        db=db,
        student_id=student_id,
        subject=payload.subject,
        topic=payload.topic,
        is_correct=payload.is_correct,
    )

    db.commit()
    db.refresh(mastery)

    return {
        "mastery_id": str(mastery.mastery_id),
        "student_id": str(mastery.student_id),
        "subject": mastery.subject,
        "topic": mastery.topic,
        "correct_answers": mastery.correct_answers,
        "total_questions": mastery.total_questions,
        "mastery_score": mastery.mastery_score,
        "mastery_percentage": round(
            mastery.mastery_score * 100,
            2,
        ),
        "message": "Mastery score updated successfully",
    }


# ============================================================
# CREATE TEST
# ============================================================


@router.post("/tests")
def create_test(
    payload: TestCreate,
    db: Session = Depends(get_db),
):
    try:
        student_id = uuid.UUID(payload.student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    if not payload.questions:
        raise HTTPException(
            status_code=400,
            detail="Test must contain at least one question",
        )

    new_test = Test(
        student_id=student_id,
        title=payload.title,
        subject=payload.subject,
    )

    db.add(new_test)
    db.flush()

    for question in payload.questions:

        new_question = TestQuestion(
            test_id=new_test.test_id,
            topic=question.topic,
            question_text=question.question_text,
            correct_answer=question.correct_answer,
        )

        db.add(new_question)

    db.commit()
    db.refresh(new_test)

    return {
        "success": True,
        "test_id": str(new_test.test_id),
        "student_id": str(new_test.student_id),
        "title": new_test.title,
        "subject": new_test.subject,
        "questions": [
            {
                "question_id": str(question.question_id),
                "topic": question.topic,
                "question_text": question.question_text,
            }
            for question in new_test.questions
        ],
        "message": "Test created successfully",
    }


# ============================================================
# GENERATE EMBEDDINGS
# ============================================================


@router.post("/embeddings/generate")
def generate_embeddings(
    payload: GenerateEmbeddingRequest,
):
    service = (
        get_embedding_service()
        if not payload.provider
        else EmbeddingService(
            provider=payload.provider
        )
    )

    if payload.text:

        embedding = service.generate_embedding(
            payload.text
        )

        return {
            "provider": service.provider,
            "dimension": len(embedding),
            "embedding": embedding,
        }

    if payload.texts:

        embeddings = (
            service.generate_embeddings_batch(
                payload.texts
            )
        )

        return {
            "provider": service.provider,
            "count": len(embeddings),
            "dimension": (
                len(embeddings[0])
                if embeddings
                else 0
            ),
            "embeddings": embeddings,
        }

    raise HTTPException(
        status_code=400,
        detail=(
            "Either 'text' or 'texts' field "
            "must be provided."
        ),
    )


# ============================================================
# KNOWLEDGE CHUNKS
# ============================================================


@router.post("/chunks")
def create_chunk(
    chunk: ChunkCreate,
    db: Session = Depends(get_db),
):
    try:
        student_id = uuid.UUID(chunk.student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    service = get_embedding_service()

    embedding = service.generate_embedding(
        chunk.text_content
    )

    new_chunk = KnowledgeChunk(
        student_id=student_id,
        text_content=chunk.text_content,
        topic_tags=chunk.topic_tags or [],
        embedding=embedding,
    )

    db.add(new_chunk)
    db.commit()
    db.refresh(new_chunk)

    return {
        "chunk_id": str(new_chunk.chunk_id),
        "student_id": str(new_chunk.student_id),
        "text_content": new_chunk.text_content,
        "topic_tags": new_chunk.topic_tags,
        "embedding_dimension": (
            len(new_chunk.embedding)
            if new_chunk.embedding is not None
            else 0
        ),
        "provider": service.provider,
        "created_at": new_chunk.created_at,
    }


@router.get("/chunks")
def list_chunks(
    db: Session = Depends(get_db),
):
    chunks = db.query(KnowledgeChunk).all()

    return {
        "chunks": [
            {
                "chunk_id": str(chunk.chunk_id),
                "student_id": str(chunk.student_id),
                "text_content": chunk.text_content,
                "topic_tags": chunk.topic_tags,
                "document_id": (
                    str(chunk.document_id)
                    if getattr(
                        chunk,
                        "document_id",
                        None,
                    )
                    else None
                ),
            }
            for chunk in chunks
        ]
    }


# ============================================================
# CELERY CHUNK EMBEDDING TEST
# ============================================================


@router.post("/process-embedding")
def trigger_embedding(
    payload: ChunkCreate,
):
    task = process_chunk_embedding.delay(
        payload.student_id,
        payload.text_content,
    )

    return {
        "task_id": task.id,
        "status": "queued",
    }


# ============================================================
# PDF UPLOAD
# ============================================================


@router.post("/upload-pdf")
async def upload_pdf_file(
    file: UploadFile = File(...),
    student_id: Optional[str] = Form(None),
):
    """
    Upload a PDF and queue it for Celery processing.

    PDF
      ↓
    Celery
      ↓
    Text extraction / OCR
      ↓
    Chunking
      ↓
    Embeddings
      ↓
    PostgreSQL + pgvector
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required.",
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    if not student_id:
        raise HTTPException(
            status_code=400,
            detail="student_id is required.",
        )

    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    from database.session import SessionLocal

    db = SessionLocal()

    try:
        student = (
            db.query(Student)
            .filter(
                Student.student_id == student_uuid
            )
            .first()
        )

        if not student:
            raise HTTPException(
                status_code=404,
                detail="Student not found",
            )

    finally:
        db.close()

    temp_dir = tempfile.gettempdir()

    safe_filename = Path(
        file.filename
    ).name

    temp_path = os.path.join(
        temp_dir,
        f"{uuid.uuid4()}_{safe_filename}",
    )

    try:

        with open(
            temp_path,
            "wb",
        ) as temp_file:

            temp_file.write(file_bytes)

        task = process_pdf_task.delay(
            temp_path,
            safe_filename,
            str(student_uuid),
        )

    except Exception as error:

        if os.path.exists(temp_path):

            try:
                os.remove(temp_path)

            except OSError:
                pass

        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to queue PDF processing: {error}"
            ),
        )

    return {
        "status": "queued",
        "task_id": task.id,
        "filename": safe_filename,
        "student_id": str(student_uuid),
        "message": (
            "PDF queued for background extraction, "
            "chunking, and vector embedding."
        ),
    }


# ============================================================
# CELERY TASK STATUS
# ============================================================


@router.get("/task-status/{task_id}")
def get_task_status(
    task_id: str,
):
    result = celery_app.AsyncResult(task_id)

    return {
        "task_id": task_id,
        "status": result.status,
        "result": (
            result.result
            if result.ready()
            else None
        ),
    }


# ============================================================
# TEST SUBMISSION
# ============================================================


@router.post("/tests/{test_id}/submit")
def submit_test(
    test_id: str,
    payload: TestSubmission,
    db: Session = Depends(get_db),
):
    try:
        test_uuid = uuid.UUID(test_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid test_id",
        )

    test = (
        db.query(Test)
        .filter(Test.test_id == test_uuid)
        .first()
    )

    if not test:
        raise HTTPException(
            status_code=404,
            detail="Test not found",
        )

    if not payload.answers:
        raise HTTPException(
            status_code=400,
            detail="No answers submitted",
        )

    submitted_answers = {
        answer.question_id: answer.answer.strip()
        for answer in payload.answers
    }

    results = []
    correct_count = 0

    for question in test.questions:

        question_id = str(
            question.question_id
        )

        submitted_answer = submitted_answers.get(
            question_id
        )

        is_correct = (
            submitted_answer is not None
            and submitted_answer.lower()
            == question.correct_answer.strip().lower()
        )

        if is_correct:
            correct_count += 1

        mastery = update_mastery_score(
            db=db,
            student_id=test.student_id,
            subject=test.subject,
            topic=question.topic,
            is_correct=is_correct,
        )

        results.append(
            {
                "question_id": question_id,
                "topic": question.topic,
                "question_text": question.question_text,
                "submitted_answer": submitted_answer,
                "correct_answer": question.correct_answer,
                "is_correct": is_correct,
                "mastery_score": mastery.mastery_score,
                "mastery_percentage": round(
                    mastery.mastery_score * 100,
                    2,
                ),
            }
        )

    total_questions = len(test.questions)

    score_percentage = (
        (correct_count / total_questions) * 100
        if total_questions > 0
        else 0
    )

    db.commit()

    return {
        "success": True,
        "test_id": str(test.test_id),
        "student_id": str(test.student_id),
        "title": test.title,
        "subject": test.subject,
        "score": correct_count,
        "total_questions": total_questions,
        "score_percentage": round(
            score_percentage,
            2,
        ),
        "results": results,
        "message": (
            "Test submitted successfully "
            "and mastery updated"
        ),
    }


# ============================================================
# DOCUMENTS
# ============================================================


@router.get("/documents/{student_id}")
def get_documents(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    docs = (
        db.query(Document)
        .filter(
            Document.student_id == student_uuid
        )
        .order_by(
            Document.created_at.desc()
        )
        .all()
    )

    return {
        "documents": [
            {
                "document_id": str(
                    document.document_id
                ),
                "filename": document.filename,
                "created_at": document.created_at,
            }
            for document in docs
        ]
    }


# ============================================================
# STUDENT MASTERY
# ============================================================


@router.get("/mastery/{student_id}")
def get_mastery(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    records = (
        db.query(StudentMastery)
        .filter(
            StudentMastery.student_id
            == student_uuid
        )
        .all()
    )

    return {
        "mastery": [
            {
                "mastery_id": str(
                    record.mastery_id
                ),
                "subject": record.subject,
                "topic": record.topic,
                "score": record.mastery_score,
                "percentage": round(
                    record.mastery_score * 100,
                    2,
                ),
                "correct_answers": (
                    record.correct_answers
                ),
                "total_questions": (
                    record.total_questions
                ),
            }
            for record in records
        ]
    }


# ============================================================
# STUDENT STRUGGLES
# ============================================================


@router.get("/struggles/{student_id}")
def get_student_struggles(
    student_id: str,
    db: Session = Depends(get_db),
):
    """
    Calculate and return the Top 5 topics where
    the student is most likely to lose marks.

    Struggle Score =
    (1 - Mastery)
    × Syllabus Weight
    × Time Decay
    """

    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(
            Student.student_id == student_uuid
        )
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    struggles = get_top_struggles(
        db=db,
        student_id=student_uuid,
        top_n=5,
    )

    return {
        "success": True,
        "student_id": str(student_uuid),
        "count": len(struggles),
        "top_struggles": struggles,
    }


# ============================================================
# STUDENT TESTS
# ============================================================


@router.get("/tests/{student_id}")
def get_tests(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    tests = (
        db.query(Test)
        .filter(
            Test.student_id == student_uuid
        )
        .all()
    )

    return {
        "tests": [
            {
                "test_id": str(test.test_id),
                "title": test.title,
                "subject": test.subject,
            }
            for test in tests
        ]
    }


# ============================================================
# GENERATE TEST
# ============================================================


@router.post("/tests/generate")
def generate_test(
    req: GenerateTestRequest,
    db: Session = Depends(get_db),
):
    # --------------------------------------------------------
    # Validate student UUID
    # --------------------------------------------------------

    try:
        student_uuid = uuid.UUID(req.student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    # --------------------------------------------------------
    # Check student exists
    # --------------------------------------------------------

    student = (
        db.query(Student)
        .filter(
            Student.student_id == student_uuid
        )
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    # --------------------------------------------------------
    # Validate number of questions
    # --------------------------------------------------------

    if req.num_questions < 1:
        raise HTTPException(
            status_code=400,
            detail="num_questions must be at least 1",
        )

    # --------------------------------------------------------
    # LLM service
    # --------------------------------------------------------

    llm = get_llm_service()

    context = ""

    # ========================================================
    # OPTION 1: Generate from document
    # ========================================================

    if req.document_id:

        try:
            document_uuid = uuid.UUID(
                req.document_id
            )

        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid document_id",
            )

        chunks = (
            db.query(KnowledgeChunk)
            .filter(
                KnowledgeChunk.document_id
                == document_uuid
            )
            .all()
        )

        context = " ".join(
            chunk.text_content
            for chunk in chunks
        )

    # ========================================================
    # OPTION 2: Generate using RAG + topic
    # ========================================================

    elif req.topic:

        chunks = retrieve_relevant_chunks(
            db=db,
            student_id=student_uuid,
            query=req.topic,
            top_k=10,
        )

        context = " ".join(
            chunk.text_content
            for chunk in chunks
        )

    # ========================================================
    # OPTION 3: General study material using RAG
    # ========================================================

    else:

        chunks = retrieve_relevant_chunks(
            db=db,
            student_id=student_uuid,
            query="general study material",
            top_k=10,
        )

        context = " ".join(
            chunk.text_content
            for chunk in chunks
        )

    # --------------------------------------------------------
    # Check context
    # --------------------------------------------------------

    if not context.strip():
        raise HTTPException(
            status_code=404,
            detail=(
                "No study material found "
                "for test generation."
            ),
        )

    # --------------------------------------------------------
    # Generate questions
    # --------------------------------------------------------

    questions = llm.generate_test_questions(
        context,
        req.num_questions,
    )

    return {
        "success": True,
        "student_id": str(student_uuid),
        "topic": req.topic,
        "num_questions": req.num_questions,
        "questions": questions,
    }


# ============================================================
# MASTERY HISTORY
# ============================================================


@router.get("/mastery-history/{student_id}")
def get_mastery_history(
    student_id: str,
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    query = (
        db.query(MasterySnapshot)
        .filter(
            MasterySnapshot.student_id
            == student_uuid
        )
    )

    if subject:

        query = query.filter(
            MasterySnapshot.subject == subject
        )

    if topic:

        query = query.filter(
            MasterySnapshot.topic == topic
        )

    history = (
        query
        .order_by(
            MasterySnapshot.snapshot_at.asc()
        )
        .all()
    )

    return {
        "history": [
            {
                "snapshot_id": str(
                    snapshot.snapshot_id
                ),
                "subject": snapshot.subject,
                "topic": snapshot.topic,
                "correct_answers": (
                    snapshot.correct_answers
                ),
                "total_questions": (
                    snapshot.total_questions
                ),
                "mastery_score": (
                    snapshot.mastery_score
                ),
                "mastery_percentage": round(
                    snapshot.mastery_score * 100,
                    2,
                ),
                "snapshot_at": (
                    snapshot.snapshot_at
                ),
            }
            for snapshot in history
        ]
    }


# ============================================================
# STRUGGLE DATA
# ============================================================


@router.get("/struggle-data/{student_id}")
def get_struggle_data(
    student_id: str,
    db: Session = Depends(get_db),
):
    data = get_struggle_input_data(
        db,
        student_id,
    )

    return {
        "student_id": student_id,
        "topics": [
            {
                "subject": row["subject"],
                "topic": row["topic"],
                "mastery_score": row["mastery_score"],
                "syllabus_weight": row["syllabus_weight"],
                "last_updated_at": row["last_updated_at"],
                "days_since_practice": row["days_since_practice"],
            }
            for row in data
        ],
    }


# ============================================================
# GUARDIAN DASHBOARD APIs
# ============================================================


@router.get("/guardian/students")
def get_guardian_students(
    guardian_email: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Lookup students linked to a guardian email or get list of available students for guardian view.
    """
    query = db.query(Student)
    if guardian_email and guardian_email.strip():
        query = query.filter(Student.guardian_email.ilike(f"%{guardian_email.strip()}%"))
    students = query.all()
    return {
        "students": [
            {
                "student_id": str(s.student_id),
                "full_name": s.full_name,
                "email": s.email,
                "grade": s.grade or "N/A",
                "board": s.board or "N/A",
                "guardian_email": s.guardian_email or "",
                "date_of_birth": str(s.date_of_birth) if s.date_of_birth else None,
            }
            for s in students
        ]
    }


@router.get("/guardian/dashboard/{student_id}")
def get_guardian_dashboard(
    student_id: str,
    db: Session = Depends(get_db),
):
    """
    Comprehensive Read-Only Guardian Dashboard Payload for a Student.
    Provides mastery scores, subject & topic breakdowns, heatmap nodes,
    struggle points, test history, and AI progress summary.
    """
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student_id UUID format")

    student = db.query(Student).filter(Student.student_id == student_uuid).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Fetch mastery records
    mastery_records = (
        db.query(StudentMastery)
        .filter(StudentMastery.student_id == student_uuid)
        .all()
    )

    # Fetch tests
    tests = db.query(Test).filter(Test.student_id == student_uuid).all()
    
    # Fetch viva sessions count if table exists
    viva_count = 0
    try:
        from database.models import VivaSession
        viva_count = db.query(VivaSession).filter(VivaSession.student_id == student_uuid).count()
    except Exception:
        pass

    # Fetch snapshots for timeline
    snapshots = (
        db.query(MasterySnapshot)
        .filter(MasterySnapshot.student_id == student_uuid)
        .order_by(MasterySnapshot.snapshot_at.asc())
        .limit(30)
        .all()
    )

    # Process subject & topic mastery
    subject_map = {}
    total_mastery_sum = 0
    total_topics_count = len(mastery_records)
    mastered_count = 0
    proficient_count = 0
    developing_count = 0
    struggling_count = 0

    heatmap_tiles = []

    for item in mastery_records:
        subj = item.subject or "General"
        score_pct = round((item.mastery_score or 0.0) * 100, 1)
        total_mastery_sum += score_pct

        if score_pct >= 85:
            status = "Mastered"
            level = "high"
            color = "#10B981"
            mastered_count += 1
        elif score_pct >= 70:
            status = "Proficient"
            level = "medium"
            color = "#3B82F6"
            proficient_count += 1
        elif score_pct >= 50:
            status = "Developing"
            level = "low"
            color = "#F59E0B"
            developing_count += 1
        else:
            status = "Needs Attention"
            level = "critical"
            color = "#EF4444"
            struggling_count += 1

        if subj not in subject_map:
            subject_map[subj] = {
                "subject": subj,
                "total_score": 0,
                "count": 0,
                "mastered_count": 0,
                "topics": [],
            }

        subject_map[subj]["total_score"] += score_pct
        subject_map[subj]["count"] += 1
        if score_pct >= 85:
            subject_map[subj]["mastered_count"] += 1

        subject_map[subj]["topics"].append({
            "topic": item.topic,
            "mastery_score": item.mastery_score,
            "percentage": score_pct,
            "correct_answers": item.correct_answers,
            "total_questions": item.total_questions,
            "status": status,
            "level": level,
            "color": color,
        })

        heatmap_tiles.append({
            "subject": subj,
            "topic": item.topic,
            "score": score_pct,
            "level": level,
            "status": status,
            "color": color,
        })

    subject_list = []
    for s_name, s_data in subject_map.items():
        avg_s_score = round(s_data["total_score"] / s_data["count"], 1)
        subject_list.append({
            "name": s_name,
            "average_score": avg_s_score,
            "total_topics": s_data["count"],
            "mastered_topics": s_data["mastered_count"],
            "topics": s_data["topics"],
        })

    overall_avg = (
        round(total_mastery_sum / total_topics_count, 1)
        if total_topics_count > 0
        else 0.0
    )

    if overall_avg >= 90:
        grade_label = "A+"
    elif overall_avg >= 80:
        grade_label = "A"
    elif overall_avg >= 70:
        grade_label = "B"
    elif overall_avg >= 60:
        grade_label = "C"
    elif overall_avg >= 50:
        grade_label = "D"
    elif total_topics_count > 0:
        grade_label = "F"
    else:
        grade_label = "N/A"

    # Struggle topics via struggle service
    top_struggles = []
    try:
        struggle_res = get_top_struggles(db, student_id, limit=5)
        top_struggles = struggle_res.get("top_struggles", [])
    except Exception:
        top_struggles = [
            {
                "topic": t.topic,
                "subject": t.subject,
                "struggle_score": round(1.0 - t.mastery_score, 2),
                "mastery_score": t.mastery_score,
            }
            for t in sorted(mastery_records, key=lambda x: x.mastery_score)[:5]
        ]

    # History timeline
    history_data = [
        {
            "snapshot_at": str(s.snapshot_at),
            "subject": s.subject,
            "topic": s.topic,
            "score": round(s.mastery_score * 100, 1),
        }
        for s in snapshots
    ]

    # Dynamic AI Guardian Summary
    strongest_subject = max(subject_list, key=lambda x: x["average_score"])["name"] if subject_list else "General"
    weakest_topic = top_struggles[0]["topic"] if (top_struggles and len(top_struggles) > 0 and "topic" in top_struggles[0]) else "None"
    ai_note = (
        f"{student.full_name} has an overall mastery score of {overall_avg}% (Grade {grade_label}). "
        f"Strongest subject area is {strongest_subject}. "
        f"{f'Topic needing primary revision focus is {weakest_topic}.' if weakest_topic != 'None' else 'Keep up the good progress across all topics!'}"
    )

    return {
        "read_only": True,
        "student": {
            "student_id": str(student.student_id),
            "full_name": student.full_name,
            "email": student.email,
            "board": student.board or "CBSE",
            "grade": student.grade or "Grade 10",
            "guardian_email": student.guardian_email or "",
            "date_of_birth": str(student.date_of_birth) if student.date_of_birth else None,
        },
        "overall_stats": {
            "overall_mastery": overall_avg,
            "grade_label": grade_label,
            "tests_completed": len(tests),
            "viva_sessions": viva_count,
            "total_topics": total_topics_count,
            "mastered_topics": mastered_count,
            "proficient_topics": proficient_count,
            "developing_topics": developing_count,
            "struggling_topics": struggling_count,
        },
        "subject_progress": subject_list,
        "topic_heatmap": heatmap_tiles,
        "struggles": top_struggles,
        "recent_tests": [
            {
                "test_id": str(t.test_id),
                "title": t.title,
                "subject": t.subject,
                "created_at": str(t.created_at),
            }
            for t in tests[:10]
        ],
        "history_timeline": history_data,
        "ai_insights": {
            "summary": ai_note,
            "strongest_subject": strongest_subject,
            "weakest_topic": weakest_topic,
            "recommended_action": f"Encourage 15-20 minutes daily practice on {weakest_topic}." if weakest_topic != 'None' else "Maintain consistent revision routines.",
        }
    }


# ============================================================
# VIVA ROOM WEBSOCKET ENDPOINT
# ============================================================

VIVA_QUESTION_BANKS = {
    "Physics": [
        {
            "id": 1,
            "question": "Can you state the First Law of Thermodynamics and explain what physical quantity it conserves?",
            "expected_keywords": ["energy", "conservation", "heat", "work", "internal energy"],
            "sample_answer": "The First Law of Thermodynamics states that energy cannot be created or destroyed, only transformed from one form to another. It expresses conservation of energy where change in internal energy equals heat added minus work done."
        },
        {
            "id": 2,
            "question": "What is the key difference between isothermal and adiabatic thermodynamic processes?",
            "expected_keywords": ["temperature", "constant", "heat transfer", "zero", "insulated"],
            "sample_answer": "In an isothermal process, temperature remains constant (delta T = 0). In an adiabatic process, no heat is exchanged between system and surroundings (Q = 0)."
        },
        {
            "id": 3,
            "question": "Explain Newton's Second Law of Motion and how force relates to momentum.",
            "expected_keywords": ["force", "mass", "acceleration", "rate of change", "momentum"],
            "sample_answer": "Newton's Second Law states that force is equal to the rate of change of momentum with respect to time (F = dp/dt = m*a)."
        },
        {
            "id": 4,
            "question": "What is the photoelectric effect and how did Einstein explain it using quanta of light?",
            "expected_keywords": ["photon", "frequency", "work function", "electron", "quantum"],
            "sample_answer": "The photoelectric effect is the emission of electrons when light hits a material. Einstein proposed light comes in discrete packets called photons (E = h*f)."
        },
        {
            "id": 5,
            "question": "Define electromagnetic induction and Faraday's Law.",
            "expected_keywords": ["magnetic flux", "induced EMF", "conductor", "change", "coil"],
            "sample_answer": "Faraday's Law states that an induced electromotive force (EMF) in any closed circuit is equal to the negative rate of change of magnetic flux through the circuit."
        }
    ],
    "Chemistry": [
        {
            "id": 1,
            "question": "What is Le Chatelier's Principle and how does it predict dynamic chemical equilibrium shifts?",
            "expected_keywords": ["equilibrium", "shift", "stress", "concentration", "temperature", "pressure"],
            "sample_answer": "Le Chatelier's principle states that if a system at equilibrium is disturbed by a change in temperature, pressure, or concentration, the system shifts to counteract the disturbance."
        },
        {
            "id": 2,
            "question": "Explain the difference between ionic and covalent chemical bonding.",
            "expected_keywords": ["sharing", "transfer", "electrons", "ions", "electronegativity"],
            "sample_answer": "Ionic bonding involves the transfer of valence electrons between atoms forming ions, whereas covalent bonding involves the mutual sharing of electron pairs."
        },
        {
            "id": 3,
            "question": "What defines an acid and a base according to the Bronsted-Lowry theory?",
            "expected_keywords": ["proton", "donor", "acceptor", "H+", "hydrogen ion"],
            "sample_answer": "A Bronsted-Lowry acid is a proton (H+) donor, and a Bronsted-Lowry base is a proton acceptor."
        },
        {
            "id": 4,
            "question": "What is hybridization in atomic orbitals and why is sp3 hybridization important for carbon?",
            "expected_keywords": ["orbital", "mixing", "tetrahedral", "methane", "valence"],
            "sample_answer": "Hybridization is the mixing of atomic orbitals into new hybrid orbitals. Carbon undergoes sp3 hybridization to form four equivalent bonds in a tetrahedral structure."
        },
        {
            "id": 5,
            "question": "Describe the main factors that influence the rate of a chemical reaction.",
            "expected_keywords": ["temperature", "concentration", "catalyst", "surface area", "activation energy"],
            "sample_answer": "Reaction rates are influenced by reactant concentration, temperature, surface area, presence of catalysts, and activation energy."
        }
    ],
    "Mathematics": [
        {
            "id": 1,
            "question": "What is the geometric interpretation of the derivative of a single-variable function?",
            "expected_keywords": ["slope", "tangent line", "rate of change", "instantaneous", "curve"],
            "sample_answer": "The derivative represents the slope of the tangent line to the function graph at a given point, representing the instantaneous rate of change."
        },
        {
            "id": 2,
            "question": "Explain the Fundamental Theorem of Calculus and how integration relates to differentiation.",
            "expected_keywords": ["antiderivative", "definite integral", "area under curve", "inverse"],
            "sample_answer": "The Fundamental Theorem of Calculus links differentiation and integration, showing that integration is the reverse process of differentiation."
        },
        {
            "id": 3,
            "question": "What is an eigenvalue and an eigenvector of a matrix?",
            "expected_keywords": ["linear transformation", "scalar", "scale", "direction", "matrix"],
            "sample_answer": "An eigenvector is a non-zero vector whose direction does not change when a linear transformation is applied, and the eigenvalue is the scalar multiplier."
        },
        {
            "id": 4,
            "question": "Define the mathematical definition of a limit of a function.",
            "expected_keywords": ["approaches", "delta", "epsilon", "value", "continuity"],
            "sample_answer": "A limit is the value that a function approaches as the input approaches some given value."
        },
        {
            "id": 5,
            "question": "What is the Law of Total Probability and Bayes' Theorem?",
            "expected_keywords": ["conditional probability", "prior", "posterior", "event", "partition"],
            "sample_answer": "Bayes' Theorem calculates the probability of an event based on prior knowledge of conditions related to the event."
        }
    ],
    "Computer Science": [
        {
            "id": 1,
            "question": "What is the difference between a process and a thread in operating systems?",
            "expected_keywords": ["memory space", "lightweight", "execution", "shared memory", "concurrency"],
            "sample_answer": "A process is an independent program execution environment with its own address space, whereas a thread is a lightweight unit of execution sharing memory within a process."
        },
        {
            "id": 2,
            "question": "Explain Time Complexity and Big O Notation using Binary Search as an example.",
            "expected_keywords": ["logarithmic", "O(log n)", "upper bound", "divide and conquer"],
            "sample_answer": "Big O notation describes the upper bound of algorithm runtime relative to input size. Binary Search has O(log n) time complexity."
        },
        {
            "id": 3,
            "question": "What are ACID properties in database management systems?",
            "expected_keywords": ["atomicity", "consistency", "isolation", "durability", "transaction"],
            "sample_answer": "ACID stands for Atomicity, Consistency, Isolation, and Durability, ensuring reliable database transaction processing."
        },
        {
            "id": 4,
            "question": "Explain Object-Oriented Programming principles: Encapsulation, Abstraction, Inheritance, and Polymorphism.",
            "expected_keywords": ["encapsulation", "abstraction", "inheritance", "polymorphism", "class"],
            "sample_answer": "OOP relies on Encapsulation (data hiding), Abstraction (simplifying complex reality), Inheritance (code reuse), and Polymorphism (many forms)."
        },
        {
            "id": 5,
            "question": "How does HTTPS establish a secure connection using TLS/SSL handshake?",
            "expected_keywords": ["certificate", "encryption", "symmetric", "asymmetric", "handshake", "public key"],
            "sample_answer": "HTTPS uses TLS handshake where public-key cryptography authenticates the server and establishes a shared symmetric key for encrypted communication."
        }
    ],
    "Biology": [
        {
            "id": 1,
            "question": "What is ATP and why is it considered the energy currency of the cell?",
            "expected_keywords": ["adenosine triphosphate", "phosphate bond", "cellular respiration", "mitochondria", "energy"],
            "sample_answer": "ATP (Adenosine Triphosphate) stores energy in high-energy phosphate bonds released during cellular processes."
        },
        {
            "id": 2,
            "question": "Describe the central dogma of molecular biology.",
            "expected_keywords": ["dna", "rna", "protein", "transcription", "translation"],
            "sample_answer": "The central dogma describes the flow of genetic information: DNA is transcribed into RNA, which is translated into protein."
        },
        {
            "id": 3,
            "question": "Explain the difference between mitosis and meiosis cell division.",
            "expected_keywords": ["diploid", "haploid", "daughter cells", "gametes", "somatic", "chromosome count"],
            "sample_answer": "Mitosis produces 2 genetically identical diploid somatic cells, whereas meiosis produces 4 genetically unique haploid gametes."
        },
        {
            "id": 4,
            "question": "How does photosynthesis convert light energy into chemical energy during light and dark reactions?",
            "expected_keywords": ["chloroplast", "chlorophyll", "calvin cycle", "light reaction", "glucose"],
            "sample_answer": "Photosynthesis captures light energy in thylakoid membranes to generate ATP/NADPH, which powers the Calvin Cycle in the stroma to produce glucose."
        },
        {
            "id": 5,
            "question": "What is natural selection and how does variation contribute to evolution?",
            "expected_keywords": ["adaptation", "survival", "fitness", "mutation", "gene frequency"],
            "sample_answer": "Natural selection acts on inheritable variations, favoring traits that improve survival and reproduction in an environment over generations."
        }
    ]
}

def evaluate_viva_student_answer(question_obj, student_answer):
    if not student_answer or len(student_answer.strip()) < 3:
        return {
            "score": 2,
            "feedback": "Response was too brief or incomplete. Please elaborate further on key concepts.",
            "strengths": ["Attempted to answer"],
            "weak_concepts": question_obj.get("expected_keywords", [])[:3]
        }
    
    text_lower = student_answer.lower()
    keywords = question_obj.get("expected_keywords", [])
    matched_keywords = [kw for kw in keywords if kw.lower() in text_lower]
    
    match_ratio = len(matched_keywords) / max(len(keywords), 1)
    word_count = len(student_answer.split())
    
    if match_ratio >= 0.7:
        score = random.randint(9, 10)
        feedback = "Outstanding response! You demonstrated thorough conceptual understanding and used precise terminology."
    elif match_ratio >= 0.4:
        score = random.randint(7, 8)
        feedback = "Good answer! You captured the main ideas well. Adding a bit more detail on key mechanisms would make it even stronger."
    elif match_ratio >= 0.2 or word_count > 12:
        score = random.randint(5, 6)
        feedback = "Partial understanding shown. You touched on relevant ideas, but missed some key core concepts."
    else:
        score = random.randint(3, 4)
        feedback = "Needs improvement. The response missed several critical terms and foundational concepts for this topic."
        
    strengths = []
    if matched_keywords:
        strengths.append(f"Correctly mentioned {', '.join(matched_keywords[:3])}")
    if word_count > 15:
        strengths.append("Clear articulation and structure")
    if not strengths:
        strengths.append("Attempted explanation")
        
    unmatched_keywords = [kw for kw in keywords if kw.lower() not in text_lower]
    weak_concepts = unmatched_keywords[:3] if unmatched_keywords else ["Minor depth details"]
    
    return {
        "score": score,
        "feedback": feedback,
        "strengths": strengths,
        "weak_concepts": weak_concepts
    }

@router.websocket("/ws/viva")
async def viva_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    session = {
        "active": False,
        "subject": "Physics",
        "topic": "General Physics",
        "total_questions": 5,
        "current_index": 0,
        "questions": [],
        "history": [],
        "scores": []
    }
    
    try:
        while True:
            raw_msg = await websocket.receive_text()
            data = json.loads(raw_msg)
            event_type = data.get("event")
            
            if event_type == "start_viva":
                subject = data.get("subject", "Physics")
                if subject not in VIVA_QUESTION_BANKS:
                    subject = "Physics"
                total_q = min(max(int(data.get("total_questions", 5)), 1), 10)
                
                bank = VIVA_QUESTION_BANKS[subject]
                selected_q = bank[:total_q]
                
                session["active"] = True
                session["subject"] = subject
                session["topic"] = data.get("topic", f"{subject} Core Concepts")
                session["total_questions"] = len(selected_q)
                session["current_index"] = 0
                session["questions"] = selected_q
                session["history"] = []
                session["scores"] = []
                
                first_q = selected_q[0]
                
                await websocket.send_json({
                    "event": "viva_started",
                    "subject": subject,
                    "topic": session["topic"],
                    "total_questions": session["total_questions"],
                    "current_question_index": 1,
                    "question": first_q["question"],
                    "question_id": first_q["id"]
                })
                
            elif event_type == "submit_answer":
                if not session["active"]:
                    await websocket.send_json({"event": "error", "message": "Viva session has not started."})
                    continue
                
                student_text = data.get("text", "").strip()
                curr_idx = session["current_index"]
                
                if curr_idx < len(session["questions"]):
                    q_obj = session["questions"][curr_idx]
                    eval_result = evaluate_viva_student_answer(q_obj, student_text)
                    
                    history_entry = {
                        "question_number": curr_idx + 1,
                        "question": q_obj["question"],
                        "student_answer": student_text or "(No spoken answer provided)",
                        "score": eval_result["score"],
                        "feedback": eval_result["feedback"],
                        "strengths": eval_result["strengths"],
                        "weak_concepts": eval_result["weak_concepts"]
                    }
                    
                    session["history"].append(history_entry)
                    session["scores"].append(eval_result["score"])
                    
                    await websocket.send_json({
                        "event": "eval_feedback",
                        "question_number": curr_idx + 1,
                        "total_questions": session["total_questions"],
                        "score": eval_result["score"],
                        "feedback": eval_result["feedback"],
                        "strengths": eval_result["strengths"],
                        "weak_concepts": eval_result["weak_concepts"],
                        "sample_answer": q_obj.get("sample_answer")
                    })
                    
            elif event_type == "next_question":
                if not session["active"]:
                    await websocket.send_json({"event": "error", "message": "Viva session has not started."})
                    continue
                    
                session["current_index"] += 1
                curr_idx = session["current_index"]
                
                if curr_idx < session["total_questions"]:
                    next_q = session["questions"][curr_idx]
                    await websocket.send_json({
                        "event": "next_question",
                        "current_question_index": curr_idx + 1,
                        "total_questions": session["total_questions"],
                        "question": next_q["question"],
                        "question_id": next_q["id"]
                    })
                else:
                    avg_score = sum(session["scores"]) / len(session["scores"]) if session["scores"] else 0
                    percentage = round((avg_score / 10.0) * 100, 1)
                    
                    all_weak = []
                    for h in session["history"]:
                        all_weak.extend(h.get("weak_concepts", []))
                    unique_weak = list(set(all_weak))[:5]
                    
                    all_strengths = []
                    for h in session["history"]:
                        all_strengths.extend(h.get("strengths", []))
                    unique_strengths = list(set(all_strengths))[:5]
                    
                    if percentage >= 90:
                        grade = "A+"
                        summary = "Exceptional performance! You demonstrated comprehensive mastery across all questions."
                    elif percentage >= 80:
                        grade = "A"
                        summary = "Great job! Strong understanding of key theoretical principles with minor areas to refine."
                    elif percentage >= 70:
                        grade = "B"
                        summary = "Good effort. You answered core questions reasonably well, but could improve depth."
                    else:
                        grade = "C"
                        summary = "Needs further revision. Focus on strengthening foundational definitions and key mechanisms."
                        
                    session["active"] = False
                    
                    await websocket.send_json({
                        "event": "viva_completed",
                        "subject": session["subject"],
                        "topic": session["topic"],
                        "final_score": percentage,
                        "average_question_score": round(avg_score, 1),
                        "grade": grade,
                        "summary": summary,
                        "strengths": unique_strengths,
                        "weak_areas": unique_weak,
                        "history": session["history"]
                    })
                    
            elif event_type == "end_viva":
                if session["history"]:
                    avg_score = sum(session["scores"]) / len(session["scores"])
                    percentage = round((avg_score / 10.0) * 100, 1)
                else:
                    avg_score = 0
                    percentage = 0.0
                    
                all_weak = []
                for h in session["history"]:
                    all_weak.extend(h.get("weak_concepts", []))
                unique_weak = list(set(all_weak))[:5] or ["Incomplete session evaluation"]
                
                session["active"] = False
                
                await websocket.send_json({
                    "event": "viva_completed",
                    "subject": session["subject"],
                    "topic": session["topic"],
                    "final_score": percentage,
                    "average_question_score": round(avg_score, 1),
                    "grade": "Early Ended",
                    "summary": f"Viva session ended early after {len(session['history'])} of {session['total_questions']} questions.",
                    "strengths": ["Completed partial viva"],
                    "weak_areas": unique_weak,
                    "history": session["history"]
                })
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"event": "error", "message": f"Server error: {str(e)}"})
        except Exception:
            pass
import os
import uuid
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    File,
    UploadFile,
    Form,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.session import get_db, SessionLocal
from database.models import (
    Student,
    KnowledgeChunk,
    Document,
    StudentMastery,
    MasterySnapshot,
    Test,
    TestQuestion,
)

from app.services.embedding_service import (
    get_embedding_service,
    EmbeddingService,
)
from app.services.mastery_service import update_mastery_score
from app.services.struggle_data_service import get_struggle_input_data
from app.services.struggle_service import get_top_struggles
from app.services.llm_service import get_llm_service
from app.services.rag_service import retrieve_relevant_chunks

from worker.celery_app import celery_app
from worker.tasks import process_chunk_embedding, process_pdf_task


>>>>>>> Stashed changes
router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================================
# PASSWORD HELPERS
# ============================================================

def hash_password(password: str) -> str:
    """Secure password hashing using PBKDF2."""
    salt = secrets.token_hex(16)

    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    )

    return f"{salt}${hashed.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash."""
    try:
        salt, saved_hash = stored_hash.split("$")

        hashed = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100000,
        )

        return secrets.compare_digest(hashed.hex(), saved_hash)

    except Exception:
        return False


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class StudentCreate(BaseModel):
    email: str
    full_name: str
    password: str

    board: Optional[str] = None
    grade: Optional[str] = None
    date_of_birth: Optional[str] = None
    exam_date: Optional[str] = None
    guardian_email: Optional[str] = None
    age: Optional[int] = None
    consent_status: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ChunkCreate(BaseModel):
    student_id: str
    text_content: str
    topic_tags: Optional[List[str]] = None


class GenerateEmbeddingRequest(BaseModel):
    text: Optional[str] = None
    texts: Optional[List[str]] = None
    provider: Optional[str] = None


class MasteryUpdateRequest(BaseModel):
    student_id: str
    subject: str
    topic: str
    is_correct: bool


class TestQuestionCreate(BaseModel):
    topic: str
    question_text: str
    correct_answer: str


class TestCreate(BaseModel):
    student_id: str
    title: str
    subject: str
    questions: List[TestQuestionCreate]


class TestAnswer(BaseModel):
    question_id: str
    answer: str


class TestSubmission(BaseModel):
    answers: List[TestAnswer]


class GenerateTestRequest(BaseModel):
    student_id: str
    document_ids: Optional[List[str]] = None
    document_id: Optional[str] = None
    topic: Optional[str] = None
    num_questions: int = 5


# ============================================================
# LOGIN
# ============================================================

@router.post("/login")
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    student = (
        db.query(Student)
        .filter(Student.email == payload.email)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if not student.password_hash:
        raise HTTPException(
            status_code=401,
            detail="Password not configured for this account",
        )

    if not verify_password(
        payload.password,
        student.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    return {
        "success": True,
        "user": {
            "student_id": str(student.student_id),
            "email": student.email,
            "full_name": student.full_name,
            "board": student.board,
            "grade": student.grade,
            "guardian_email": student.guardian_email,
        },
        "message": "Login successful",
    }


# ============================================================
# STUDENT ENDPOINTS
# ============================================================

@router.get("/students")
def list_students(
    db: Session = Depends(get_db),
):
    students = db.query(Student).all()

    return {
        "students": [
            {
                "student_id": str(s.student_id),
                "email": s.email,
                "full_name": s.full_name,
                "board": s.board,
                "grade": s.grade,
                "date_of_birth": (
                    str(s.date_of_birth)
                    if s.date_of_birth
                    else None
                ),
                "guardian_email": s.guardian_email,
                "created_at": s.created_at,
            }
            for s in students
        ]
    }


@router.post("/students")
def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
):
    existing_student = (
        db.query(Student)
        .filter(Student.email == student.email)
        .first()
    )

    if existing_student:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    new_student = Student(
        email=student.email,
        full_name=student.full_name,
        password_hash=hash_password(student.password),
        board=student.board,
        grade=student.grade,
        date_of_birth=student.date_of_birth,
        exam_date=student.exam_date,
        guardian_email=student.guardian_email,
        age=student.age,
        consent_status=student.consent_status,
    )

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    return {
        "success": True,
        "student_id": str(new_student.student_id),
        "user": {
            "student_id": str(new_student.student_id),
            "email": new_student.email,
            "full_name": new_student.full_name,
            "board": new_student.board,
            "grade": new_student.grade,
            "guardian_email": new_student.guardian_email,
        },
        "message": "Student created successfully",
    }


# ============================================================
# MASTERY UPDATE
# ============================================================

@router.post("/mastery/update")
def update_mastery(
    payload: MasteryUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        student_id = uuid.UUID(payload.student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    mastery = update_mastery_score(
        db=db,
        student_id=student_id,
        subject=payload.subject,
        topic=payload.topic,
        is_correct=payload.is_correct,
    )

    db.commit()
    db.refresh(mastery)

    return {
        "mastery_id": str(mastery.mastery_id),
        "student_id": str(mastery.student_id),
        "subject": mastery.subject,
        "topic": mastery.topic,
        "correct_answers": mastery.correct_answers,
        "total_questions": mastery.total_questions,
        "mastery_score": mastery.mastery_score,
        "mastery_percentage": round(
            mastery.mastery_score * 100,
            2,
        ),
        "message": "Mastery score updated successfully",
    }


# ============================================================
# CREATE TEST
# ============================================================

@router.post("/tests")
def create_test(
    payload: TestCreate,
    db: Session = Depends(get_db),
):
    try:
        student_id = uuid.UUID(payload.student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    if not payload.questions:
        raise HTTPException(
            status_code=400,
            detail="Test must contain at least one question",
        )

    new_test = Test(
        student_id=student_id,
        title=payload.title,
        subject=payload.subject,
    )

    db.add(new_test)
    db.flush()

    for question in payload.questions:
        db.add(
            TestQuestion(
                test_id=new_test.test_id,
                topic=question.topic,
                question_text=question.question_text,
                correct_answer=question.correct_answer,
            )
        )

    db.commit()
    db.refresh(new_test)

    return {
        "success": True,
        "test_id": str(new_test.test_id),
        "student_id": str(new_test.student_id),
        "title": new_test.title,
        "subject": new_test.subject,
        "questions": [
            {
                "question_id": str(q.question_id),
                "topic": q.topic,
                "question_text": q.question_text,
            }
            for q in new_test.questions
        ],
        "message": "Test created successfully",
    }


# ============================================================
# GENERATE EMBEDDINGS
# ============================================================

@router.post("/embeddings/generate")
def generate_embeddings(
    payload: GenerateEmbeddingRequest,
):
    service = (
        get_embedding_service()
        if not payload.provider
        else EmbeddingService(provider=payload.provider)
    )

    if payload.text:
        embedding = service.generate_embedding(payload.text)

        return {
            "provider": service.provider,
            "dimension": len(embedding),
            "embedding": embedding,
        }

    if payload.texts:
        embeddings = service.generate_embeddings_batch(
            payload.texts
        )

        return {
            "provider": service.provider,
            "count": len(embeddings),
            "dimension": (
                len(embeddings[0])
                if embeddings
                else 0
            ),
            "embeddings": embeddings,
        }

    raise HTTPException(
        status_code=400,
        detail="Either 'text' or 'texts' must be provided.",
    )


# ============================================================
# KNOWLEDGE CHUNKS
# ============================================================

@router.post("/chunks")
def create_chunk(
    chunk: ChunkCreate,
    db: Session = Depends(get_db),
):
    try:
        student_id = uuid.UUID(chunk.student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    service = get_embedding_service()
    embedding = service.generate_embedding(
        chunk.text_content
    )

    new_chunk = KnowledgeChunk(
        student_id=student_id,
        text_content=chunk.text_content,
        topic_tags=chunk.topic_tags or [],
        embedding=embedding,
    )

    db.add(new_chunk)
    db.commit()
    db.refresh(new_chunk)

    return {
        "chunk_id": str(new_chunk.chunk_id),
        "student_id": str(new_chunk.student_id),
        "text_content": new_chunk.text_content,
        "topic_tags": new_chunk.topic_tags,
        "embedding_dimension": (
            len(new_chunk.embedding)
            if new_chunk.embedding is not None
            else 0
        ),
        "provider": service.provider,
        "created_at": new_chunk.created_at,
    }


@router.get("/chunks")
def list_chunks(
    db: Session = Depends(get_db),
):
    chunks = db.query(KnowledgeChunk).all()

    return {
        "chunks": [
            {
                "chunk_id": str(c.chunk_id),
                "student_id": str(c.student_id),
                "text_content": c.text_content,
                "topic_tags": c.topic_tags,
                "document_id": (
                    str(c.document_id)
                    if getattr(c, "document_id", None)
                    else None
                ),
            }
            for c in chunks
        ]
    }


@router.post("/process-embedding")
def trigger_embedding(
    payload: ChunkCreate,
):
    task = process_chunk_embedding.delay(
        payload.student_id,
        payload.text_content,
    )

    return {
        "task_id": task.id,
        "status": "queued",
    }


# ============================================================
# PDF UPLOAD
# ============================================================

# ============================================================
# PDF UPLOAD
# ============================================================

@router.post("/upload-pdf")
async def upload_pdf_file(
    file: UploadFile = File(...),
    student_id: Optional[str] = Form(None),
    subject: str = Form(...),
):
    """
    Upload a PDF and queue it for Celery processing.

    User enters the subject manually.

    PDF + Subject
        ↓
    FastAPI
        ↓
    Celery
        ↓
    Text extraction / OCR
        ↓
    Chunking
        ↓
    Embeddings
        ↓
    PostgreSQL + pgvector
    """

    # --------------------------------------------------------
    # 1. Validate filename
    # --------------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required.",
        )

    # --------------------------------------------------------
    # 2. Validate PDF
    # --------------------------------------------------------

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    # --------------------------------------------------------
    # 3. Validate student ID
    # --------------------------------------------------------

    if not student_id:
        raise HTTPException(
            status_code=400,
            detail="student_id is required.",
        )

    try:
        student_uuid = uuid.UUID(student_id)

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    # --------------------------------------------------------
    # 4. Validate subject
    # --------------------------------------------------------

    if not subject or not subject.strip():
        raise HTTPException(
            status_code=400,
            detail="Subject is required.",
        )

    subject = subject.strip()

    # --------------------------------------------------------
    # 5. Read uploaded file
    # --------------------------------------------------------

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    # --------------------------------------------------------
    # 6. Check student exists
    # --------------------------------------------------------

    db = SessionLocal()

    try:
        student = (
            db.query(Student)
            .filter(
                Student.student_id == student_uuid
            )
            .first()
        )

        if not student:
            raise HTTPException(
                status_code=404,
                detail="Student not found",
            )

    finally:
        db.close()

    # --------------------------------------------------------
    # 7. Create temporary file
    # --------------------------------------------------------

    temp_dir = tempfile.gettempdir()

    safe_filename = Path(
        file.filename
    ).name

    temp_path = os.path.join(
        temp_dir,
        f"{uuid.uuid4()}_{safe_filename}",
    )

    try:

        with open(
            temp_path,
            "wb"
        ) as temp_file:

            temp_file.write(file_bytes)

        # ----------------------------------------------------
        # 8. Send PDF + subject to Celery
        # ----------------------------------------------------

        task = process_pdf_task.delay(
            temp_path,
            safe_filename,
            str(student_uuid),
            subject,
        )

    except Exception as error:

        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to queue PDF processing: "
                f"{error}"
            ),
        )

    # --------------------------------------------------------
    # 9. Return response
    # --------------------------------------------------------

    return {
        "status": "queued",
        "task_id": task.id,
        "filename": safe_filename,
        "student_id": str(student_uuid),
        "subject": subject,
        "message": (
            "PDF queued for background extraction, "
            "chunking, and vector embedding."
        ),
    }

# ============================================================
# TEST SUBMISSION
# ============================================================

@router.post("/tests/{test_id}/submit")
def submit_test(
    test_id: str,
    payload: TestSubmission,
    db: Session = Depends(get_db),
):
    try:
        test_uuid = uuid.UUID(test_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid test_id",
        )

    test = (
        db.query(Test)
        .filter(Test.test_id == test_uuid)
        .first()
    )

    if not test:
        raise HTTPException(
            status_code=404,
            detail="Test not found",
        )

    if not payload.answers:
        raise HTTPException(
            status_code=400,
            detail="No answers submitted",
        )

    submitted_answers = {
        answer.question_id: answer.answer.strip()
        for answer in payload.answers
    }

    results = []
    correct_count = 0

    for question in test.questions:
        question_id = str(question.question_id)

        submitted_answer = submitted_answers.get(
            question_id
        )

        is_correct = (
            submitted_answer is not None
            and submitted_answer.lower()
            == question.correct_answer.strip().lower()
        )

        if is_correct:
            correct_count += 1

        mastery = update_mastery_score(
            db=db,
            student_id=test.student_id,
            subject=test.subject,
            topic=question.topic,
            is_correct=is_correct,
        )

        results.append(
            {
                "question_id": question_id,
                "topic": question.topic,
                "question_text": question.question_text,
                "submitted_answer": submitted_answer,
                "correct_answer": question.correct_answer,
                "is_correct": is_correct,
                "mastery_score": mastery.mastery_score,
                "mastery_percentage": round(
                    mastery.mastery_score * 100,
                    2,
                ),
            }
        )

    total_questions = len(test.questions)

    score_percentage = (
        (correct_count / total_questions) * 100
        if total_questions > 0
        else 0
    )

    db.commit()

    return {
        "success": True,
        "test_id": str(test.test_id),
        "student_id": str(test.student_id),
        "title": test.title,
        "subject": test.subject,
        "score": correct_count,
        "total_questions": total_questions,
        "score_percentage": round(
            score_percentage,
            2,
        ),
        "results": results,
        "message": (
            "Test submitted successfully "
            "and mastery updated"
        ),
    }


# ============================================================
# DOCUMENTS
# ============================================================

@router.get("/documents/{student_id}")
def get_documents(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    docs = (
        db.query(Document)
        .filter(
            Document.student_id == student_uuid
        )
        .order_by(
            Document.created_at.desc()
        )
        .all()
    )

    return {
        "documents": [
            {
                "document_id": str(d.document_id),
                "filename": d.filename,

                # IMPORTANT:
                # Manually entered subject Library ko bhej raha hai
                "subject": d.subject,

                "created_at": d.created_at,
            }
            for d in docs
        ]
    }


# ============================================================
# DELETE DOCUMENT
# ============================================================

@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
):
    try:
        document_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid document_id",
        )

    document = (
        db.query(Document)
        .filter(
            Document.document_id == document_uuid
        )
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    try:
        # Delete all RAG chunks belonging to this PDF
        db.query(KnowledgeChunk).filter(
            KnowledgeChunk.document_id == document_uuid
        ).delete(
            synchronize_session=False
        )

        # Delete the document itself
        db.delete(document)

        db.commit()

        return {
            "success": True,
            "document_id": document_id,
            "message": "Document and related chunks deleted successfully",
        }

    except Exception as error:
        db.rollback()

        logger.exception(
            "Failed to delete document"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete document: {error}",
        )



# ============================================================
# STUDENT MASTERY
# ============================================================

@router.get("/mastery/{student_id}")
def get_mastery(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    records = (
        db.query(StudentMastery)
        .filter(
            StudentMastery.student_id == student_uuid
        )
        .all()
    )

    return {
        "mastery": [
            {
                "mastery_id": str(r.mastery_id),
                "subject": r.subject,
                "topic": r.topic,
                "score": r.mastery_score,
                "percentage": round(
                    r.mastery_score * 100,
                    2,
                ),
                "correct_answers": r.correct_answers,
                "total_questions": r.total_questions,
            }
            for r in records
        ]
    }


# ============================================================
# STUDENT STRUGGLES
# ============================================================

@router.get("/struggles/{student_id}")
def get_student_struggles(
    student_id: str,
    db: Session = Depends(get_db),
):
    """
    Calculate and return the Top 5 topics where
    the student is most likely to lose marks.

    Struggle Score =
        (1 - Mastery) x Syllabus Weight x Time Decay
    """

    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(Student.student_id == student_uuid)
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    struggles = get_top_struggles(
        db=db,
        student_id=student_uuid,
        top_n=5,
    )

    return {
        "success": True,
        "student_id": str(student_uuid),
        "count": len(struggles),
        "top_struggles": struggles,
    }


# ============================================================
# STUDENT TESTS
# ============================================================

@router.get("/tests/{student_id}")
def get_tests(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    tests = (
        db.query(Test)
        .filter(Test.student_id == student_uuid)
        .all()
    )

    return {
        "tests": [
            {
                "test_id": str(t.test_id),
                "title": t.title,
                "subject": t.subject,
            }
            for t in tests
        ]
    }


# ============================================================
# VIVA QUESTION BANKS
# ============================================================

VIVA_QUESTION_BANKS = {
    "Physics": [
        {
            "id": 1,
            "question": (
                "Can you state the First Law of Thermodynamics "
                "and explain what physical quantity it conserves?"
            ),
            "expected_keywords": [
                "energy",
                "conservation",
                "heat",
                "work",
                "internal energy",
            ],
            "sample_answer": (
                "The First Law of Thermodynamics states that "
                "energy cannot be created or destroyed, only "
                "transformed from one form to another. It "
                "expresses conservation of energy where change "
                "in internal energy equals heat added minus "
                "work done."
            ),
        },
        {
            "id": 2,
            "question": (
                "What is the key difference between isothermal "
                "and adiabatic thermodynamic processes?"
            ),
            "expected_keywords": [
                "temperature",
                "constant",
                "heat transfer",
                "zero",
                "insulated",
            ],
            "sample_answer": (
                "In an isothermal process, temperature remains "
                "constant (delta T = 0). In an adiabatic process, "
                "no heat is exchanged between system and "
                "surroundings (Q = 0)."
            ),
        },
        {
            "id": 3,
            "question": (
                "Explain Newton's Second Law of Motion and "
                "how force relates to momentum."
            ),
            "expected_keywords": [
                "force",
                "mass",
                "acceleration",
                "rate of change",
                "momentum",
            ],
            "sample_answer": (
                "Newton's Second Law states that force is equal "
                "to the rate of change of momentum with respect "
                "to time (F = dp/dt = m*a)."
            ),
        },
        {
            "id": 4,
            "question": (
                "What is the photoelectric effect and how did "
                "Einstein explain it using quanta of light?"
            ),
            "expected_keywords": [
                "photon",
                "frequency",
                "work function",
                "electron",
                "quantum",
            ],
            "sample_answer": (
                "The photoelectric effect is the emission of "
                "electrons when light hits a material. Einstein "
                "proposed light comes in discrete packets called "
                "photons (E = h*f)."
            ),
        },
        {
            "id": 5,
            "question": (
                "Define electromagnetic induction and Faraday's Law."
            ),
            "expected_keywords": [
                "magnetic flux",
                "induced EMF",
                "conductor",
                "change",
                "coil",
            ],
            "sample_answer": (
                "Faraday's Law states that an induced "
                "electromotive force (EMF) in any closed circuit "
                "is equal to the negative rate of change of "
                "magnetic flux through the circuit."
            ),
        },
    ],

    "Chemistry": [
        {
            "id": 1,
            "question": (
                "What is Le Chatelier's Principle and how does "
                "it predict dynamic chemical equilibrium shifts?"
            ),
            "expected_keywords": [
                "equilibrium",
                "shift",
                "stress",
                "concentration",
                "temperature",
                "pressure",
            ],
            "sample_answer": (
                "Le Chatelier's principle states that if a "
                "system at equilibrium is disturbed by a change "
                "in temperature, pressure, or concentration, "
                "the system shifts to counteract the disturbance."
            ),
        },
        {
            "id": 2,
            "question": (
                "Explain the difference between ionic and "
                "covalent chemical bonding."
            ),
            "expected_keywords": [
                "sharing",
                "transfer",
                "electrons",
                "ions",
                "electronegativity",
            ],
            "sample_answer": (
                "Ionic bonding involves the transfer of valence "
                "electrons between atoms forming ions, whereas "
                "covalent bonding involves the mutual sharing "
                "of electron pairs."
            ),
        },
        {
            "id": 3,
            "question": (
                "What defines an acid and a base according "
                "to the Bronsted-Lowry theory?"
            ),
            "expected_keywords": [
                "proton",
                "donor",
                "acceptor",
                "H+",
                "hydrogen ion",
            ],
            "sample_answer": (
                "A Bronsted-Lowry acid is a proton (H+) donor, "
                "and a Bronsted-Lowry base is a proton acceptor."
            ),
        },
        {
            "id": 4,
            "question": (
                "What is hybridization in atomic orbitals and "
                "why is sp3 hybridization important for carbon?"
            ),
            "expected_keywords": [
                "orbital",
                "mixing",
                "tetrahedral",
                "methane",
                "valence",
            ],
            "sample_answer": (
                "Hybridization is the mixing of atomic orbitals "
                "into new hybrid orbitals. Carbon undergoes sp3 "
                "hybridization to form four equivalent bonds "
                "in a tetrahedral structure."
            ),
        },
        {
            "id": 5,
            "question": (
                "Describe the main factors that influence "
                "the rate of a chemical reaction."
            ),
            "expected_keywords": [
                "temperature",
                "concentration",
                "catalyst",
                "surface area",
                "activation energy",
            ],
            "sample_answer": (
                "Reaction rates are influenced by reactant "
                "concentration, temperature, surface area, "
                "presence of catalysts, and activation energy."
            ),
        },
    ],

    "Mathematics": [
        {
            "id": 1,
            "question": (
                "What is the geometric interpretation of the "
                "derivative of a single-variable function?"
            ),
            "expected_keywords": [
                "slope",
                "tangent line",
                "rate of change",
                "instantaneous",
                "curve",
            ],
            "sample_answer": (
                "The derivative represents the slope of the "
                "tangent line to the function graph at a given "
                "point, representing the instantaneous rate "
                "of change."
            ),
        },
        {
            "id": 2,
            "question": (
                "Explain the Fundamental Theorem of Calculus "
                "and how integration relates to differentiation."
            ),
            "expected_keywords": [
                "antiderivative",
                "definite integral",
                "area under curve",
                "inverse",
            ],
            "sample_answer": (
                "The Fundamental Theorem of Calculus links "
                "differentiation and integration, showing that "
                "integration is the reverse process of "
                "differentiation."
            ),
        },
        {
            "id": 3,
            "question": (
                "What is an eigenvalue and an eigenvector of a matrix?"
            ),
            "expected_keywords": [
                "linear transformation",
                "scalar",
                "scale",
                "direction",
                "matrix",
            ],
            "sample_answer": (
                "An eigenvector is a non-zero vector whose "
                "direction does not change when a linear "
                "transformation is applied, and the eigenvalue "
                "is the scalar multiplier."
            ),
        },
        {
            "id": 4,
            "question": (
                "Define the mathematical definition of a "
                "limit of a function."
            ),
            "expected_keywords": [
                "approaches",
                "delta",
                "epsilon",
                "value",
                "continuity",
            ],
            "sample_answer": (
                "A limit is the value that a function approaches "
                "as the input approaches some given value."
            ),
        },
        {
            "id": 5,
            "question": (
                "What is the Law of Total Probability and "
                "Bayes' Theorem?"
            ),
            "expected_keywords": [
                "conditional probability",
                "prior",
                "posterior",
                "event",
                "partition",
            ],
            "sample_answer": (
                "Bayes' Theorem calculates the probability of "
                "an event based on prior knowledge of conditions "
                "related to the event."
            ),
        },
    ],

    "Computer Science": [
        {
            "id": 1,
            "question": (
                "What is the difference between a process and "
                "a thread in operating systems?"
            ),
            "expected_keywords": [
                "memory space",
                "lightweight",
                "execution",
                "shared memory",
                "concurrency",
            ],
            "sample_answer": (
                "A process is an independent program execution "
                "environment with its own address space, whereas "
                "a thread is a lightweight unit of execution "
                "sharing memory within a process."
            ),
        },
        {
            "id": 2,
            "question": (
                "Explain Time Complexity and Big O Notation "
                "using Binary Search as an example."
            ),
            "expected_keywords": [
                "logarithmic",
                "O(log n)",
                "upper bound",
                "divide and conquer",
            ],
            "sample_answer": (
                "Big O notation describes the upper bound of "
                "algorithm runtime relative to input size. "
                "Binary Search has O(log n) time complexity."
            ),
        },
        {
            "id": 3,
            "question": (
                "What are ACID properties in database "
                "management systems?"
            ),
            "expected_keywords": [
                "atomicity",
                "consistency",
                "isolation",
                "durability",
                "transaction",
            ],
            "sample_answer": (
                "ACID stands for Atomicity, Consistency, "
                "Isolation, and Durability, ensuring reliable "
                "database transaction processing."
            ),
        },
        {
            "id": 4,
            "question": (
                "Explain Object-Oriented Programming principles: "
                "Encapsulation, Abstraction, Inheritance, "
                "and Polymorphism."
            ),
            "expected_keywords": [
                "encapsulation",
                "abstraction",
                "inheritance",
                "polymorphism",
                "class",
            ],
            "sample_answer": (
                "OOP relies on Encapsulation (data hiding), "
                "Abstraction (simplifying complex reality), "
                "Inheritance (code reuse), and Polymorphism "
                "(many forms)."
            ),
        },
        {
            "id": 5,
            "question": (
                "How does HTTPS establish a secure connection "
                "using TLS/SSL handshake?"
            ),
            "expected_keywords": [
                "certificate",
                "encryption",
                "symmetric",
                "asymmetric",
                "handshake",
                "public key",
            ],
            "sample_answer": (
                "HTTPS uses TLS handshake where public-key "
                "cryptography authenticates the server and "
                "establishes a shared symmetric key for "
                "encrypted communication."
            ),
        },
    ],

    "Biology": [
        {
            "id": 1,
            "question": (
                "What is ATP and why is it considered the "
                "energy currency of the cell?"
            ),
            "expected_keywords": [
                "adenosine triphosphate",
                "phosphate bond",
                "cellular respiration",
                "mitochondria",
                "energy",
            ],
            "sample_answer": (
                "ATP (Adenosine Triphosphate) stores energy "
                "in high-energy phosphate bonds released "
                "during cellular processes."
            ),
        },
        {
            "id": 2,
            "question": (
                "Describe the central dogma of molecular biology."
            ),
            "expected_keywords": [
                "dna",
                "rna",
                "protein",
                "transcription",
                "translation",
            ],
            "sample_answer": (
                "The central dogma describes the flow of genetic "
                "information: DNA is transcribed into RNA, "
                "which is translated into protein."
            ),
        },
        {
            "id": 3,
            "question": (
                "Explain the difference between mitosis and "
                "meiosis cell division."
            ),
            "expected_keywords": [
                "diploid",
                "haploid",
                "daughter cells",
                "gametes",
                "somatic",
                "chromosome count",
            ],
            "sample_answer": (
                "Mitosis produces 2 genetically identical "
                "diploid somatic cells, whereas meiosis "
                "produces 4 genetically unique haploid gametes."
            ),
        },
        {
            "id": 4,
            "question": (
                "How does photosynthesis convert light energy "
                "into chemical energy during light and "
                "dark reactions?"
            ),
            "expected_keywords": [
                "chloroplast",
                "chlorophyll",
                "calvin cycle",
                "light reaction",
                "glucose",
            ],
            "sample_answer": (
                "Photosynthesis captures light energy in "
                "thylakoid membranes to generate ATP/NADPH, "
                "which powers the Calvin Cycle in the stroma "
                "to produce glucose."
            ),
        },
        {
            "id": 5,
            "question": (
                "What is natural selection and how does "
                "variation contribute to evolution?"
            ),
            "expected_keywords": [
                "adaptation",
                "survival",
                "fitness",
                "mutation",
                "gene frequency",
            ],
            "sample_answer": (
                "Natural selection acts on inheritable "
                "variations, favoring traits that improve "
                "survival and reproduction in an environment "
                "over generations."
            ),
        },
    ],
}


# ============================================================
# VIVA ANSWER EVALUATION
# ============================================================

def evaluate_viva_student_answer(
    question_obj,
    student_answer,
):
    if (
        not student_answer
        or len(student_answer.strip()) < 3
    ):
        return {
            "score": 2,
            "feedback": (
                "Response was too brief or incomplete. "
                "Please elaborate further on key concepts."
            ),
            "strengths": [
                "Attempted to answer"
            ],
            "weak_concepts": question_obj.get(
                "expected_keywords",
                [],
            )[:3],
        }

    text_lower = student_answer.lower()

    keywords = question_obj.get(
        "expected_keywords",
        [],
    )

    matched_keywords = [
        kw
        for kw in keywords
        if kw.lower() in text_lower
    ]

    match_ratio = (
        len(matched_keywords)
        / max(len(keywords), 1)
    )

    word_count = len(
        student_answer.split()
    )

    if match_ratio >= 0.7:
        score = random.randint(9, 10)

        feedback = (
            "Outstanding response! You demonstrated "
            "thorough conceptual understanding and "
            "used precise terminology."
        )

    elif match_ratio >= 0.4:
        score = random.randint(7, 8)

        feedback = (
            "Good answer! You captured the main ideas "
            "well. Adding a bit more detail on key "
            "mechanisms would make it even stronger."
        )

    elif match_ratio >= 0.2 or word_count > 12:
        score = random.randint(5, 6)

        feedback = (
            "Partial understanding shown. You touched "
            "on relevant ideas, but missed some key "
            "core concepts."
        )

    else:
        score = random.randint(3, 4)

        feedback = (
            "Needs improvement. The response missed "
            "several critical terms and foundational "
            "concepts for this topic."
        )

    strengths = []

    if matched_keywords:
        strengths.append(
            "Correctly mentioned "
            + ", ".join(matched_keywords[:3])
        )

    if word_count > 15:
        strengths.append(
            "Clear articulation and structure"
        )

    if not strengths:
        strengths.append(
            "Attempted explanation"
        )

    unmatched_keywords = [
        kw
        for kw in keywords
        if kw.lower() not in text_lower
    ]

    weak_concepts = (
        unmatched_keywords[:3]
        if unmatched_keywords
        else ["Minor depth details"]
    )

    return {
        "score": score,
        "feedback": feedback,
        "strengths": strengths,
        "weak_concepts": weak_concepts,
    }


# ============================================================
# VIVA WEBSOCKET
# ============================================================

@router.websocket("/ws/viva")
async def viva_websocket_endpoint(
    websocket: WebSocket,
):
    await websocket.accept()

    session = {
        "active": False,
        "subject": "Physics",
        "topic": "General Physics",
        "total_questions": 5,
        "current_index": 0,
        "questions": [],
        "history": [],
        "scores": [],
    }

    try:
        while True:
            raw_msg = await websocket.receive_text()

            data = json.loads(raw_msg)

            event_type = data.get("event")

            # ====================================================
            # START VIVA
            # ====================================================

            if event_type == "start_viva":

                subject = data.get(
                    "subject",
                    "Physics",
                )

                if subject not in VIVA_QUESTION_BANKS:
                    subject = "Physics"

                total_q = min(
                    max(
                        int(
                            data.get(
                                "total_questions",
                                5,
                            )
                        ),
                        1,
                    ),
                    10,
                )

                bank = VIVA_QUESTION_BANKS[
                    subject
                ]

                selected_q = bank[:total_q]

                session["active"] = True
                session["subject"] = subject

                session["topic"] = data.get(
                    "topic",
                    f"{subject} Core Concepts",
                )

                session["total_questions"] = len(
                    selected_q
                )

                session["current_index"] = 0
                session["questions"] = selected_q
                session["history"] = []
                session["scores"] = []

                first_q = selected_q[0]

                await websocket.send_json(
                    {
                        "event": "viva_started",
                        "subject": subject,
                        "topic": session["topic"],
                        "total_questions": session[
                            "total_questions"
                        ],
                        "current_question_index": 1,
                        "question": first_q[
                            "question"
                        ],
                        "question_id": first_q["id"],
                    }
                )

            # ====================================================
            # SUBMIT ANSWER
            # ====================================================

            elif event_type == "submit_answer":

                if not session["active"]:
                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": (
                                "Viva session has not started."
                            ),
                        }
                    )
                    continue

                student_text = data.get(
                    "text",
                    "",
                ).strip()

                curr_idx = session[
                    "current_index"
                ]

                if curr_idx < len(
                    session["questions"]
                ):

                    q_obj = session[
                        "questions"
                    ][curr_idx]

                    eval_result = (
                        evaluate_viva_student_answer(
                            q_obj,
                            student_text,
                        )
                    )

                    history_entry = {
                        "question_number": curr_idx + 1,
                        "question": q_obj["question"],
                        "student_answer": (
                            student_text
                            or "(No spoken answer provided)"
                        ),
                        "score": eval_result["score"],
                        "feedback": eval_result[
                            "feedback"
                        ],
                        "strengths": eval_result[
                            "strengths"
                        ],
                        "weak_concepts": eval_result[
                            "weak_concepts"
                        ],
                    }

                    session["history"].append(
                        history_entry
                    )

                    session["scores"].append(
                        eval_result["score"]
                    )

                    await websocket.send_json(
                        {
                            "event": "eval_feedback",
                            "question_number": curr_idx + 1,
                            "total_questions": session[
                                "total_questions"
                            ],
                            "score": eval_result["score"],
                            "feedback": eval_result[
                                "feedback"
                            ],
                            "strengths": eval_result[
                                "strengths"
                            ],
                            "weak_concepts": eval_result[
                                "weak_concepts"
                            ],
                            "sample_answer": q_obj.get(
                                "sample_answer"
                            ),
                        }
                    )

            # ====================================================
            # NEXT QUESTION
            # ====================================================

            elif event_type == "next_question":

                if not session["active"]:
                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": (
                                "Viva session has not started."
                            ),
                        }
                    )
                    continue

                session["current_index"] += 1

                curr_idx = session[
                    "current_index"
                ]

                if curr_idx < session[
                    "total_questions"
                ]:

                    next_q = session[
                        "questions"
                    ][curr_idx]

                    await websocket.send_json(
                        {
                            "event": "next_question",
                            "current_question_index": (
                                curr_idx + 1
                            ),
                            "total_questions": session[
                                "total_questions"
                            ],
                            "question": next_q[
                                "question"
                            ],
                            "question_id": next_q[
                                "id"
                            ],
                        }
                    )

                else:

                    avg_score = (
                        sum(session["scores"])
                        / len(session["scores"])
                        if session["scores"]
                        else 0
                    )

                    percentage = round(
                        (avg_score / 10.0) * 100,
                        1,
                    )

                    all_weak = []

                    for h in session["history"]:
                        all_weak.extend(
                            h.get(
                                "weak_concepts",
                                [],
                            )
                        )

                    unique_weak = list(
                        set(all_weak)
                    )[:5]

                    all_strengths = []

                    for h in session["history"]:
                        all_strengths.extend(
                            h.get(
                                "strengths",
                                [],
                            )
                        )

                    unique_strengths = list(
                        set(all_strengths)
                    )[:5]

                    if percentage >= 90:
                        grade = "A+"
                        summary = (
                            "Exceptional performance! "
                            "You demonstrated comprehensive "
                            "mastery across all questions."
                        )

                    elif percentage >= 80:
                        grade = "A"
                        summary = (
                            "Great job! Strong understanding "
                            "of key theoretical principles "
                            "with minor areas to refine."
                        )

                    elif percentage >= 70:
                        grade = "B"
                        summary = (
                            "Good effort. You answered core "
                            "questions reasonably well, but "
                            "could improve depth."
                        )

                    else:
                        grade = "C"
                        summary = (
                            "Needs further revision. Focus "
                            "on strengthening foundational "
                            "definitions and key mechanisms."
                        )

                    session["active"] = False

                    await websocket.send_json(
                        {
                            "event": "viva_completed",
                            "subject": session[
                                "subject"
                            ],
                            "topic": session[
                                "topic"
                            ],
                            "final_score": percentage,
                            "average_question_score": round(
                                avg_score,
                                1,
                            ),
                            "grade": grade,
                            "summary": summary,
                            "strengths": unique_strengths,
                            "weak_areas": unique_weak,
                            "history": session[
                                "history"
                            ],
                        }
                    )

            # ====================================================
            # END VIVA
            # ====================================================

            elif event_type == "end_viva":

                if session["history"]:
                    avg_score = (
                        sum(session["scores"])
                        / len(session["scores"])
                    )

                    percentage = round(
                        (avg_score / 10.0) * 100,
                        1,
                    )

                else:
                    avg_score = 0
                    percentage = 0.0

                all_weak = []

                for h in session["history"]:
                    all_weak.extend(
                        h.get(
                            "weak_concepts",
                            [],
                        )
                    )

                unique_weak = (
                    list(set(all_weak))[:5]
                    or ["Incomplete session evaluation"]
                )

                session["active"] = False

                await websocket.send_json(
                    {
                        "event": "viva_completed",
                        "subject": session[
                            "subject"
                        ],
                        "topic": session[
                            "topic"
                        ],
                        "final_score": percentage,
                        "average_question_score": round(
                            avg_score,
                            1,
                        ),
                        "grade": "Early Ended",
                        "summary": (
                            f"Viva session ended early "
                            f"after {len(session['history'])} "
                            f"of {session['total_questions']} "
                            f"questions."
                        ),
                        "strengths": [
                            "Completed partial viva"
                        ],
                        "weak_areas": unique_weak,
                        "history": session[
                            "history"
                        ],
                    }
                )

    except WebSocketDisconnect:
        pass

    except Exception as e:
        try:
            await websocket.send_json(
                {
                    "event": "error",
                    "message": (
                        f"Server error: {str(e)}"
                    ),
                }
            )

        except Exception:
            pass


# ============================================================
# GENERATE TEST
# Supports:
# 1. Explicit document selection
# 2. RAG topic fallback
# 3. General RAG fallback
# ============================================================

@router.post("/tests/generate")
def generate_test(
    req: GenerateTestRequest,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(
            req.student_id
        )

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    student = (
        db.query(Student)
        .filter(
            Student.student_id == student_uuid
        )
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    if req.num_questions < 1:
        raise HTTPException(
            status_code=400,
            detail="num_questions must be at least 1",
        )

    llm = get_llm_service()

    context_parts: List[str] = []

    # ========================================================
    # DOCUMENT IDS
    # ========================================================

    document_ids = list(
        dict.fromkeys(
            req.document_ids or []
        )
    )

    if (
        req.document_id
        and req.document_id not in document_ids
    ):
        document_ids.append(
            req.document_id
        )

    # ========================================================
    # OPTION 1: EXPLICIT DOCUMENTS
    # ========================================================

    if document_ids:

        try:
            document_uuids = [
                uuid.UUID(doc_id)
                for doc_id in document_ids
            ]

        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid document_id",
            )

        documents = (
            db.query(Document)
            .filter(
                Document.student_id
                == student_uuid,
                Document.document_id.in_(
                    document_uuids
                ),
            )
            .all()
        )

        found_ids = {
            str(document.document_id)
            for document in documents
        }

        missing_ids = [
            doc_id
            for doc_id in document_ids
            if doc_id not in found_ids
        ]

        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=(
                    "One or more selected PDFs "
                    "were not found for this student."
                ),
            )

        for document in documents:

            chunks = (
                db.query(KnowledgeChunk)
                .filter(
                    KnowledgeChunk.student_id
                    == student_uuid,
                    KnowledgeChunk.document_id
                    == document.document_id,
                )
                .all()
            )

            if chunks:

                filename = (
                    document.filename
                    or "Uploaded Notes"
                )

                context_parts.append(
                    f"\n[SOURCE DOCUMENT: {filename}]\n"
                )

                context_parts.extend(
                    c.text_content
                    for c in chunks
                    if c.text_content
                )

    # ========================================================
    # OPTION 2: TOPIC RAG
    # ========================================================

    elif req.topic:

        try:
            chunks = retrieve_relevant_chunks(
                db=db,
                student_id=student_uuid,
                query=req.topic,
                top_k=10,
            )

            context_parts.extend(
                c.text_content
                for c in chunks
                if c.text_content
            )

        except Exception as e:

            logger.error(
                (
                    f"Failed to retrieve chunks "
                    f"for topic '{req.topic}': {e}"
                ),
                exc_info=True,
            )

            raise HTTPException(
                status_code=500,
                detail=(
                    "Failed to retrieve study material."
                ),
            )

    # ========================================================
    # OPTION 3: GENERAL RAG
    # ========================================================

    else:

        try:
            chunks = retrieve_relevant_chunks(
                db=db,
                student_id=student_uuid,
                query="general study material",
                top_k=10,
            )

            context_parts.extend(
                c.text_content
                for c in chunks
                if c.text_content
            )

        except Exception as e:

            logger.error(
                (
                    "Failed to retrieve general "
                    f"study material chunks: {e}"
                ),
                exc_info=True,
            )

            raise HTTPException(
                status_code=500,
                detail=(
                    "Failed to retrieve study material."
                ),
            )

    # ========================================================
    # BUILD CONTEXT
    # ========================================================

    context = " ".join(
        context_parts
    ).strip()

    if not context:
        raise HTTPException(
            status_code=404,
            detail=(
                "No processed content was found for "
                "the selected PDF(s)/topic. Please wait "
                "for PDF processing to finish or add "
                "more notes."
            ),
        )

    # ========================================================
    # GENERATE QUESTIONS
    # ========================================================

    try:
        questions = llm.generate_test_questions(
            context,
            req.num_questions,
        )

    except Exception as exc:

        logger.exception(
            "Test question generation failed"
        )

        raise HTTPException(
            status_code=502,
            detail=(
                f"Test generation failed: {exc}"
            ),
        ) from exc

    if not questions:
        raise HTTPException(
            status_code=502,
            detail=(
                "No questions were generated. "
                "Check the LLM API quota/key and make "
                "sure the selected PDFs/topic contain "
                "readable processed text."
            ),
        )

    return {
        "success": True,
        "student_id": str(student_uuid),
        "topic": req.topic,
        "num_questions": req.num_questions,
        "document_ids": document_ids,
        "questions": questions,
    }


# ============================================================
# MASTERY HISTORY
# ============================================================

@router.get("/mastery-history/{student_id}")
def get_mastery_history(
    student_id: str,
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(
            student_id
        )

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    query = (
        db.query(MasterySnapshot)
        .filter(
            MasterySnapshot.student_id
            == student_uuid
        )
    )

    if subject:
        query = query.filter(
            MasterySnapshot.subject
            == subject
        )

    if topic:
        query = query.filter(
            MasterySnapshot.topic
            == topic
        )

    history = (
        query
        .order_by(
            MasterySnapshot.snapshot_at.asc()
        )
        .all()
    )

    return {
        "history": [
            {
                "snapshot_id": str(
                    s.snapshot_id
                ),
                "subject": s.subject,
                "topic": s.topic,
                "correct_answers": (
                    s.correct_answers
                ),
                "total_questions": (
                    s.total_questions
                ),
                "mastery_score": (
                    s.mastery_score
                ),
                "mastery_percentage": round(
                    s.mastery_score * 100,
                    2,
                ),
                "snapshot_at": s.snapshot_at,
            }
            for s in history
        ]
    }


# ============================================================
# STRUGGLE DATA
# ============================================================

@router.get("/struggle-data/{student_id}")
def get_struggle_data(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        student_uuid = uuid.UUID(
            student_id
        )

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid student_id",
        )

    data = get_struggle_input_data(
        db,
        student_uuid,
    )

    return {
        "student_id": student_id,
        "topics": [
            {
                "subject": row["subject"],
                "topic": row["topic"],
                "mastery_score": (
                    row["mastery_score"]
                ),
                "syllabus_weight": (
                    row["syllabus_weight"]
                ),
                "last_updated_at": (
                    row["last_updated_at"]
                ),
                "days_since_practice": (
                    row["days_since_practice"]
                ),
            }
            for row in data
        ],
    }

class RevisionReviewRequest(BaseModel):
    schedule_id: str
    quality_score: int


class RevisionSettingsRequest(BaseModel):
    max_daily_minutes: int


from app.services.revision_service import (
    get_revision_plan,
    update_revision_settings,
    record_topic_review,
)


# ============================================================
# REVISION PLANNER
# ============================================================

@router.get("/revision/{student_id}/plan")
def get_student_revision_plan(
    student_id: str,
    db: Session = Depends(get_db),
):
    try:
        return get_revision_plan(db, student_id)
    except Exception as e:
        logger.exception(f"Error fetching revision plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/revision/{student_id}/settings")
def update_student_revision_settings(
    student_id: str,
    payload: RevisionSettingsRequest,
    db: Session = Depends(get_db),
):
    try:
        return update_revision_settings(
            db,
            student_id,
            payload.max_daily_minutes,
        )
    except Exception as e:
        logger.exception(f"Error updating revision settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/revision/{student_id}/review")
def review_revision_task(
    student_id: str,
    payload: RevisionReviewRequest,
    db: Session = Depends(get_db),
):
    try:
        return record_topic_review(
            db,
            student_id,
            payload.schedule_id,
            payload.quality_score,
        )
    except Exception as e:
        logger.exception(f"Error recording revision review: {e}")
        raise HTTPException(status_code=500, detail=str(e))
