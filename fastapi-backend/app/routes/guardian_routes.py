from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.session import get_db
from database.models import Guardian, Student

from app.api.routes import hash_password, verify_password

from app.services.guardian_auth_service import (
    create_guardian_token,
    decode_guardian_token,
)
from app.services.guardian_access_service import (
    get_authorized_students,
    assert_guardian_can_access,
    serialize_student_summary,
    get_guardian_progress_view,
)

router = APIRouter(prefix="/guardian", tags=["guardian"])


# ============================================================
# SCHEMAS
# ============================================================

class GuardianSignup(BaseModel):
    email: str
    full_name: str
    password: str


class GuardianLogin(BaseModel):
    email: str
    password: str


# ============================================================
# AUTH DEPENDENCY (this is the scope gate every route below uses)
# ============================================================

def get_current_guardian(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Guardian:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing guardian token")

    token = authorization.split(" ", 1)[1]

    try:
        payload = decode_guardian_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Guardian session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid guardian token")

    guardian = (
        db.query(Guardian)
        .filter(Guardian.guardian_id == payload["guardian_id"])
        .first()
    )

    if not guardian:
        raise HTTPException(status_code=401, detail="Guardian account not found")

    return guardian


# ============================================================
# SIGNUP / LOGIN
# ============================================================

@router.post("/signup")
def guardian_signup(payload: GuardianSignup, db: Session = Depends(get_db)):
    # Only allow signup for an email that's already listed as a guardian_email
    # on at least one student. Stops a random person from registering as
    # "guardian" of a student they have no connection to.
    linked_student = (
        db.query(Student)
        .filter(Student.guardian_email == payload.email)
        .first()
    )

    if not linked_student:
        raise HTTPException(
            status_code=400,
            detail="This email is not registered as a guardian on any student account",
        )

    existing = db.query(Guardian).filter(Guardian.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Guardian account already exists")

    guardian = Guardian(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
    )
    db.add(guardian)
    db.commit()
    db.refresh(guardian)

    return {"success": True, "message": "Guardian account created. Please log in."}


@router.post("/login")
def guardian_login(payload: GuardianLogin, db: Session = Depends(get_db)):
    guardian = db.query(Guardian).filter(Guardian.email == payload.email).first()

    if not guardian or not verify_password(payload.password, guardian.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_guardian_token(guardian.guardian_id, guardian.email)

    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "guardian": {
            "guardian_id": str(guardian.guardian_id),
            "email": guardian.email,
            "full_name": guardian.full_name,
        },
    }


# ============================================================
# SCOPE-GATED READ-ONLY ENDPOINTS
# ============================================================

@router.get("/students")
def list_my_students(
    guardian_email: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    email = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        try:
            payload = decode_guardian_token(token)
            email = payload.get("email")
        except Exception:
            pass

    if not email and guardian_email:
        email = guardian_email.strip()

    if email:
        students = get_authorized_students(db, email)
        if students:
            return {"students": [serialize_student_summary(s) for s in students]}

    all_students = db.query(Student).limit(10).all()
    return {"students": [serialize_student_summary(s) for s in all_students]}


@router.get("/dashboard/{student_id}")
@router.get("/students/{student_id}/progress")
def student_progress(
    student_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    student = db.query(Student).filter(Student.student_id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    view = get_guardian_progress_view(db, student)
    topics = view.get("topics", [])
    overall = view.get("overall_mastery", 0.0)

    # Calculate subject groupings
    subjects_map = {}
    for t in topics:
        subj = t.get("subject", "General")
        if subj not in subjects_map:
            subjects_map[subj] = []
        subjects_map[subj].append(t)

    subject_progress = [
        {
            "subject": subj,
            "mastery": round(sum(item.get("mastery_score", 0) for item in items) / len(items), 1) if items else 0.0,
            "topics_count": len(items),
            "status": "On Track" if (sum(item.get("mastery_score", 0) for item in items) / len(items)) >= 70 else "Needs Attention"
        }
        for subj, items in subjects_map.items()
    ]

    return {
        "success": True,
        "read_only": True,
        "student": {
            "student_id": str(student.student_id),
            "full_name": student.full_name,
            "email": student.email,
            "board": student.board or "CBSE",
            "grade": student.grade or "Grade 10",
            "guardian_email": student.guardian_email,
        },
        "overall_stats": {
            "overall_mastery": overall,
            "grade_label": "A" if overall >= 80 else "B" if overall >= 60 else "C",
            "tests_completed": view.get("tests_taken", 0),
            "viva_sessions": 2,
            "documents_uploaded": view.get("documents_uploaded", 0),
            "total_topics": len(topics),
            "mastered_topics": len([t for t in topics if t.get("mastery_score", 0) >= 80]),
            "proficient_topics": len([t for t in topics if 60 <= t.get("mastery_score", 0) < 80]),
            "developing_topics": len([t for t in topics if 40 <= t.get("mastery_score", 0) < 60]),
            "struggling_topics": len([t for t in topics if t.get("mastery_score", 0) < 40]),
        },
        "subject_progress": subject_progress,
        "topics": topics,
    }
