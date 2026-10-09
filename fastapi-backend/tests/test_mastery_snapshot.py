import os
import sys
import uuid

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from database.session import SessionLocal
from database.models import Student, StudentMastery, MasterySnapshot
from app.services.mastery_service import update_mastery_score


def test_mastery_update_creates_snapshot():
    db = SessionLocal()

    try:
        # Create a throwaway student to attach mastery records to
        student = Student(
            email=f"test_{uuid.uuid4()}@example.com",
            full_name="Test Student"
        )
        db.add(student)
        db.commit()
        db.refresh(student)

        # First update: 1 correct out of 1
        mastery = update_mastery_score(
            db=db,
            student_id=student.student_id,
            subject="Physics",
            topic="Kinematics",
            is_correct=True
        )

        assert mastery.correct_answers == 1
        assert mastery.total_questions == 1

        # Second update: 1 correct out of 2 total now
        update_mastery_score(
            db=db,
            student_id=student.student_id,
            subject="Physics",
            topic="Kinematics",
            is_correct=False
        )

        # Check that snapshots were created for both updates, in order
        snapshots = (
            db.query(MasterySnapshot)
            .filter(MasterySnapshot.student_id == student.student_id)
            .order_by(MasterySnapshot.snapshot_at.asc())
            .all()
        )

        assert len(snapshots) == 2

        assert snapshots[0].correct_answers == 1
        assert snapshots[0].total_questions == 1

        assert snapshots[1].correct_answers == 1
        assert snapshots[1].total_questions == 2

        print("Mastery snapshot versioning test passed!")

    finally:
        # Clean up: deleting the student cascades to mastery + snapshots
        db.query(Student).filter(
            Student.student_id == student.student_id
        ).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    test_mastery_update_creates_snapshot()