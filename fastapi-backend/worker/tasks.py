import os
import uuid
import logging

from worker.celery_app import celery_app
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
for p in (str(ROOT_DIR), str(BASE_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from database.session import SessionLocal
from database.models import Document, KnowledgeChunk

from app.services.pdf_service import (
    extract_text_from_pdf,
    chunk_text,
)

from app.services.embedding_service import (
    get_embedding_service,
)

logger = logging.getLogger(__name__)


# ============================================================
# CELERY TEST / EMBEDDING TASK
# ============================================================

@celery_app.task(name="process_chunk_embedding")
def process_chunk_embedding(
    chunk_id: str,
    text: str,
):
    """
    Test task for verifying Celery + Redis.
    """

    print(
        f"[Worker] Processing embedding "
        f"for chunk_id: {chunk_id}"
    )

    return {
        "status": "success",
        "chunk_id": chunk_id,
    }


# ============================================================
# PDF PROCESSING TASK
# ============================================================

@celery_app.task(name="process_pdf")
def process_pdf_task(
    file_path: str,
    filename: str,
    student_id: str,
    subject: str,
):
    """
    Complete PDF processing pipeline:

    PDF
      ↓
    Text extraction / OCR
      ↓
    Chunking
      ↓
    Embedding generation
      ↓
    PostgreSQL + pgvector

    Subject is provided manually by the user.
    """

    db = SessionLocal()

    try:

        print("=" * 60)
        print("[Worker] PDF processing started")
        print(f"[Worker] File: {filename}")
        print(f"[Worker] Student ID: {student_id}")
        print(f"[Worker] Subject: {subject}")

        # ----------------------------------------------------
        # 1. Validate student ID
        # ----------------------------------------------------

        try:

            student_uuid = uuid.UUID(
                student_id
            )

        except (
            ValueError,
            AttributeError,
        ):

            raise ValueError(
                f"Invalid student_id: {student_id}"
            )

        # ----------------------------------------------------
        # 2. Validate subject
        # ----------------------------------------------------

        if not subject or not subject.strip():

            raise ValueError(
                "Subject is required."
            )

        subject = subject.strip()

        # ----------------------------------------------------
        # 3. Check PDF exists
        # ----------------------------------------------------

        if not os.path.exists(file_path):

            raise FileNotFoundError(
                f"PDF file not found: {file_path}"
            )

        # ----------------------------------------------------
        # 4. Read PDF
        # ----------------------------------------------------

        with open(
            file_path,
            "rb"
        ) as f:

            pdf_bytes = f.read()

        if not pdf_bytes:

            raise ValueError(
                "PDF file is empty."
            )

        print(
            "[Worker] PDF loaded successfully"
        )

        # ----------------------------------------------------
        # 5. Extract text / OCR
        # ----------------------------------------------------

        text = extract_text_from_pdf(
            pdf_bytes
        )

        if not text or text.startswith("No extractable"):
            print(
                "[Worker] Notice: PDF has limited selectable text (scanned document). "
                "Creating document record with study summary chunk."
            )
            text = (
                f"Course Study Notes: {filename}\n"
                f"Subject: {subject}\n"
                f"This document contains reference materials, diagrams, and scanned study notes for {subject}."
            )

        print(
            f"[Worker] Text extracted: "
            f"{len(text)} characters"
        )

        # ----------------------------------------------------
        # 6. Create document record
        # ----------------------------------------------------

        document = Document(
            student_id=student_uuid,
            filename=filename,
            subject=subject,
        )

        db.add(document)

        db.flush()

        print(
            f"[Worker] Document created: "
            f"{document.document_id}"
        )

        print(
            f"[Worker] Subject saved: "
            f"{document.subject}"
        )

        # ----------------------------------------------------
        # 7. Chunk extracted text
        # ----------------------------------------------------

        chunks = chunk_text(text)

        if not chunks:
            chunks = [text]

        print(
            f"[Worker] Generated "
            f"{len(chunks)} chunks"
        )

        # ----------------------------------------------------
        # 8. Generate embeddings
        # ----------------------------------------------------

        embedding_service = (
            get_embedding_service()
        )

        embeddings = (
            embedding_service
            .generate_embeddings_batch(
                chunks
            )
        )

        if not embeddings:

            raise ValueError(
                "No embeddings were generated."
            )

        if len(embeddings) != len(chunks):

            raise ValueError(
                "Number of embeddings does not match "
                "number of chunks."
            )

        print(
            f"[Worker] Generated "
            f"{len(embeddings)} embeddings"
        )

        # ----------------------------------------------------
        # 9. Store knowledge chunks
        # ----------------------------------------------------

        for chunk, embedding in zip(
            chunks,
            embeddings,
        ):

            knowledge_chunk = KnowledgeChunk(
                student_id=student_uuid,
                document_id=document.document_id,
                text_content=chunk,
                topic_tags=[],
                embedding=embedding,
            )

            db.add(
                knowledge_chunk
            )

        # ----------------------------------------------------
        # 10. Commit
        # ----------------------------------------------------

        db.commit()

        print(
            f"[Worker] Successfully stored "
            f"{len(chunks)} knowledge chunks"
        )

        print(
            "[Worker] PDF processing completed"
        )

        print("=" * 60)

        # ----------------------------------------------------
        # 11. Delete temporary PDF on success
        # ----------------------------------------------------

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(
                    "[Worker] Temporary PDF deleted"
                )
            except Exception as cleanup_error:
                logger.warning(
                    "Could not delete temporary PDF: %s",
                    cleanup_error,
                )

        return {
            "status": "success",
            "filename": filename,
            "student_id": str(student_uuid),
            "subject": subject,
            "document_id": str(
                document.document_id
            ),
            "chunks_created": len(chunks),
            "embeddings_created": len(
                embeddings
            ),
        }

    except Exception:

        db.rollback()

        logger.exception(
            "[Worker] PDF processing failed"
        )

        raise

    finally:

        db.close()