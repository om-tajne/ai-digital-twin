import os
import redis
from sqlalchemy import func
from sqlalchemy.orm import Session
from database.models import StudentMastery, MasterySnapshot

# Optional: set up redis client lazily
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.Redis.from_url(redis_url)

# BKT Default Parameters
BKT_P_L0 = 0.30  # Initial probability of knowledge
BKT_P_TRANSIT = 0.10  # Probability of learning the skill
BKT_P_GUESS = 0.25  # Probability of guessing correctly (e.g. 4 options = 0.25)
BKT_P_SLIP = 0.10  # Probability of slipping (making a mistake despite knowing)

def update_bkt_probability(current_p: float, is_correct: bool) -> float:
    """
    Update mastery probability using Bayesian Knowledge Tracing.
    """
    if is_correct:
        # P(L|Correct) = P(L)*(1 - Slip) / [ P(L)*(1 - Slip) + (1 - P(L))*Guess ]
        p_l_given_obs = (current_p * (1 - BKT_P_SLIP)) / (
            (current_p * (1 - BKT_P_SLIP)) + ((1 - current_p) * BKT_P_GUESS)
        )
    else:
        # P(L|Incorrect) = P(L)*Slip / [ P(L)*Slip + (1 - P(L))*(1 - Guess) ]
        p_l_given_obs = (current_p * BKT_P_SLIP) / (
            (current_p * BKT_P_SLIP) + ((1 - current_p) * (1 - BKT_P_GUESS))
        )
    
    # P(L_new) = P(L|obs) + (1 - P(L|obs)) * P_Transit
    new_p = p_l_given_obs + (1 - p_l_given_obs) * BKT_P_TRANSIT
    
    return round(new_p, 4)

def update_mastery_score(
    db: Session,
    student_id,
    subject: str,
    topic: str,
    is_correct: bool
):
    """
    Update student's mastery score based on
    question performance.
    """

    # Normalise names so "Dynamic Programming", "dynamic programming " and a
    # blank subject all map to ONE row instead of creating duplicates.
    subject = " ".join(str(subject or "").split()) or "General"
    topic = " ".join(str(topic or "").split()) or "General"

    # Find existing mastery record (case-insensitive, oldest first)
    mastery = (
        db.query(StudentMastery)
        .filter(
            StudentMastery.student_id == student_id,
            func.lower(func.trim(StudentMastery.subject)) == subject.lower(),
            func.lower(func.trim(StudentMastery.topic)) == topic.lower()
        )
        .order_by(StudentMastery.created_at)
        .first()
    )

    # Create a new mastery record if one doesn't exist
    if mastery is None:
        mastery = StudentMastery(
            student_id=student_id,
            subject=subject,
            topic=topic,
            correct_answers=0,
            total_questions=0,
            mastery_score=BKT_P_L0  # Initialize with Prior Probability
        )
        db.add(mastery)

    # Every answered question increases total questions
    mastery.total_questions += 1

    # Increase correct answers if answer is correct
    if is_correct:
        mastery.correct_answers += 1

    # Apply BKT algorithm
    mastery.mastery_score = update_bkt_probability(
        mastery.mastery_score,
        is_correct
    )

    # Save changes
    db.commit()
    db.refresh(mastery)
    create_mastery_snapshot(db, mastery)


    # Invalidate top-struggles cache in Node.js / Redis
    try:
        redis_client.delete(f"struggles:{student_id}")
    except Exception as e:
        print(f"Warning: failed to invalidate cache for student {student_id}: {e}")

    return mastery

def create_mastery_snapshot(
    db: Session,
    mastery: StudentMastery
):
    """
    Insert a snapshot row capturing the current state
    of a mastery record. Called after every mastery update
    to preserve history.
    """

    snapshot = MasterySnapshot(
        student_id=mastery.student_id,
        subject=mastery.subject,
        topic=mastery.topic,
        correct_answers=mastery.correct_answers,
        total_questions=mastery.total_questions,
        mastery_score=mastery.mastery_score
    )

    db.add(snapshot)
    db.commit()

    return snapshot