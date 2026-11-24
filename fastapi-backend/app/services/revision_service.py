from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from database.models import (
    RevisionSchedule,
    StudentRevisionSettings,
    StudentMastery,
    StudentMasteryHistory,
)

from app.services.struggle_service import get_top_struggles


# ============================================================
# SM-2 SPACED REPETITION ALGORITHM
# ============================================================

def calculate_sm2(
    repetition: int,
    ease_factor: float,
    interval_days: int,
    quality: int,
):
    """
    SuperMemo-2 (SM-2) Spaced Repetition Algorithm.

    Quality scale (0 to 5):
    5: Perfect response
    4: Correct response after a hesitation
    3: Correct response recalled with serious difficulty
    2: Incorrect response; correct answer seemed easy to remember
    1: Incorrect response; correct answer remembered
    0: Complete blackout

    Returns:
        (new_repetition, new_ease_factor, new_interval_days)
    """

    quality = max(0, min(5, int(quality)))

    # Calculate new ease factor
    new_ef = ease_factor + (
        0.1
        - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    )

    # SM-2 minimum ease factor
    if new_ef < 1.3:
        new_ef = 1.3

    new_ef = round(new_ef, 3)

    if quality < 3:
        # Failed review
        new_repetition = 0
        new_interval = 1

    else:
        # Successful review
        if repetition == 0:
            new_interval = 1

        elif repetition == 1:
            new_interval = 6

        else:
            new_interval = round(interval_days * new_ef)

        new_repetition = repetition + 1

    return new_repetition, new_ef, max(1, new_interval)


# ============================================================
# PRIORITY & STUDY TIME
# ============================================================

def determine_priority(
    struggle_score: float,
    is_overdue: bool = False,
) -> str:
    """
    Assign priority level to a revision topic.
    """

    if struggle_score >= 1.0 or is_overdue:
        return "HIGH"

    elif struggle_score >= 0.5:
        return "MEDIUM"

    else:
        return "LOW"


def estimate_study_minutes(
    struggle_score: float,
    syllabus_weight: float = 1.0,
) -> int:
    """
    Estimate study duration in minutes.

    Range:
        Minimum = 10 minutes
        Maximum = 30 minutes
        Default = 15 minutes
    """

    base_mins = 15

    adjusted = (
        base_mins
        * (1.0 + (struggle_score * 0.5))
        * syllabus_weight
    )

    return min(
        30,
        max(10, int(round(adjusted))),
    )


# ============================================================
# REVISION SETTINGS
# ============================================================

def get_or_create_settings(
    db: Session,
    student_id: str,
) -> StudentRevisionSettings:
    """
    Get student's revision settings.

    If settings do not exist, create default settings.
    """

    settings = (
        db.query(StudentRevisionSettings)
        .filter(
            StudentRevisionSettings.student_id == student_id
        )
        .first()
    )

    if not settings:
        settings = StudentRevisionSettings(
            student_id=student_id,
            max_daily_minutes=60,
        )

        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


# ============================================================
# SYNC STRUGGLES TO REVISION SCHEDULE
# ============================================================

def sync_struggles_to_revision_schedule(
    db: Session,
    student_id: str,
):
    """
    Fetch weak/struggling topics from the Struggle Predictor
    and synchronize them with RevisionSchedule.
    """

    today = date.today()

    # --------------------------------------------------------
    # Get struggling topics
    # --------------------------------------------------------

    struggles = get_top_struggles(
        db,
        student_id,
        top_n=20,
    )

    # --------------------------------------------------------
    # Fallback to StudentMastery
    # --------------------------------------------------------

    if not struggles:

        mastery_records = (
            db.query(StudentMastery)
            .filter(
                StudentMastery.student_id == student_id
            )
            .all()
        )

        for record in mastery_records:

            struggles.append(
                {
                    "topic": record.topic,
                    "subject": record.subject,
                    "struggle_score": round(
                        1.0 - record.mastery_score,
                        4,
                    ),
                    "syllabus_weight": 1.0,
                }
            )

    # --------------------------------------------------------
    # Normalise + de-duplicate struggles
    # --------------------------------------------------------
    # The same topic can appear several times (different casing, stray
    # spaces, blank vs "General" subject). The table is unique on
    # (student, subject, topic), so merge duplicates first and keep the
    # worst (highest) struggle score.

    def _clean(value, default=""):
        return " ".join(str(value or "").split()) or default

    def _key(subject_name, topic_name):
        return (subject_name.lower(), topic_name.lower())

    unique_items = {}

    for item in struggles:
        topic_name = _clean(item.get("topic"))
        subject_name = _clean(item.get("subject"), "General")

        if not topic_name:
            continue

        key = _key(subject_name, topic_name)
        score = float(item.get("struggle_score", 0.5))

        if key not in unique_items or score > unique_items[key]["struggle_score"]:
            unique_items[key] = {
                "topic": topic_name,
                "subject": subject_name,
                "struggle_score": score,
                "syllabus_weight": float(item.get("syllabus_weight", 1.0)),
            }

    # --------------------------------------------------------
    # Existing schedules, indexed by the same normalised key
    # --------------------------------------------------------

    existing_by_key = {}

    for row in (
        db.query(RevisionSchedule)
        .filter(RevisionSchedule.student_id == student_id)
        .order_by(RevisionSchedule.created_at.asc())
        .all()
    ):
        existing_by_key.setdefault(
            _key(_clean(row.subject, "General"), _clean(row.topic)),
            row,
        )

    # --------------------------------------------------------
    # Create/update revision schedules
    # --------------------------------------------------------

    for key, item in unique_items.items():

        topic_name = item["topic"]
        subject_name = item["subject"]
        struggle_score = item["struggle_score"]
        syllabus_weight = item["syllabus_weight"]

        existing = existing_by_key.get(key)

        estimated_mins = estimate_study_minutes(
            struggle_score,
            syllabus_weight,
        )

        # ----------------------------------------------------
        # Create new schedule
        # ----------------------------------------------------

        if not existing:

            priority = determine_priority(
                struggle_score,
                is_overdue=True,
            )

            new_schedule = RevisionSchedule(
                student_id=student_id,
                subject=subject_name,
                topic=topic_name,
                struggle_score=struggle_score,
                priority=priority,
                repetition_number=0,
                easiness_factor=2.5,
                interval_days=1,
                estimated_minutes=estimated_mins,
                next_review_date=today,
                status="PENDING",
            )

            db.add(new_schedule)
            existing_by_key[key] = new_schedule

        # ----------------------------------------------------
        # Update existing schedule
        # ----------------------------------------------------

        else:

            existing.struggle_score = struggle_score
            existing.estimated_minutes = estimated_mins

            is_overdue = (
                existing.next_review_date <= today
                and existing.status == "PENDING"
            )

            existing.priority = determine_priority(
                struggle_score,
                is_overdue,
            )

            # A task that is due (including a COMPLETED one whose
            # spaced-repetition interval has elapsed) goes back to PENDING.
            # Without this, a reviewed topic never came back for revision.
            if existing.next_review_date <= today:
                existing.status = "PENDING"

    db.commit()


# ============================================================
# WORKLOAD BALANCING
# ============================================================

def balance_workload(
    db: Session,
    student_id: str,
):
    """
    Ensure total estimated study time per day does not
    exceed student's maximum daily study time.

    Lower-priority tasks are moved to future days when
    necessary.
    """

    settings = get_or_create_settings(
        db,
        student_id,
    )

    max_daily_mins = settings.max_daily_minutes
    today = date.today()

    # --------------------------------------------------------
    # Get pending tasks
    # --------------------------------------------------------

    pending_tasks = (
        db.query(RevisionSchedule)
        .filter(
            RevisionSchedule.student_id == student_id,
            RevisionSchedule.status == "PENDING",
        )
        .order_by(
            RevisionSchedule.next_review_date.asc(),
            RevisionSchedule.struggle_score.desc(),
        )
        .all()
    )

    if not pending_tasks:
        return

    # --------------------------------------------------------
    # Track workload for each date
    # --------------------------------------------------------

    daily_workload = {}

    for task in pending_tasks:

        # Move overdue tasks to today
        curr_date = max(
            today,
            task.next_review_date,
        )

        target_date = curr_date

        # ----------------------------------------------------
        # Find a date where task fits
        # ----------------------------------------------------

        while True:

            current_mins = daily_workload.get(
                target_date,
                0,
            )

            if (
                current_mins + task.estimated_minutes
                <= max_daily_mins
                or target_date > curr_date + timedelta(days=14)
            ):

                daily_workload[target_date] = (
                    current_mins
                    + task.estimated_minutes
                )

                task.next_review_date = target_date

                break

            target_date += timedelta(days=1)

    db.commit()


# ============================================================
# GET REVISION PLAN
# ============================================================

def get_revision_plan(
    db: Session,
    student_id: str,
):
    """
    Sync struggles, balance workload,
    and return the complete revision plan.
    """

    # First sync struggles
    sync_struggles_to_revision_schedule(
        db,
        student_id,
    )

    # Then balance workload
    balance_workload(
        db,
        student_id,
    )

    settings = get_or_create_settings(
        db,
        student_id,
    )

    today = date.today()

    # --------------------------------------------------------
    # Get all tasks
    # --------------------------------------------------------

    tasks = (
        db.query(RevisionSchedule)
        .filter(
            RevisionSchedule.student_id == student_id
        )
        .order_by(
            RevisionSchedule.next_review_date.asc(),
            RevisionSchedule.struggle_score.desc(),
        )
        .all()
    )

    # --------------------------------------------------------
    # Separate tasks
    # --------------------------------------------------------

    today_tasks = [
        task
        for task in tasks
        if (
            task.next_review_date == today
            and task.status == "PENDING"
        )
    ]

    def _reviewed_today(task):
        # last_reviewed_at is stored as naive UTC; compare in local time
        if not task.last_reviewed_at:
            return False
        reviewed = task.last_reviewed_at
        if reviewed.tzinfo is None:
            reviewed = reviewed.replace(tzinfo=timezone.utc)
        return reviewed.astimezone().date() == today

    # A reviewed task is rescheduled into the future right away, so
    # "completed today" must be judged by when it was reviewed.
    completed_today = [
        task
        for task in tasks
        if task.status == "COMPLETED" and _reviewed_today(task)
    ]

    upcoming_tasks = [
        task
        for task in tasks
        if task.next_review_date > today
    ]

    today_minutes = sum(
        task.estimated_minutes
        for task in today_tasks
    )

    # --------------------------------------------------------
    # Format task
    # --------------------------------------------------------

    def format_task(task):

        return {
            "schedule_id": str(task.id),
            "student_id": str(task.student_id),
            "subject": task.subject,
            "topic": task.topic,
            "struggle_score": task.struggle_score,
            "priority": task.priority,
            "repetition": task.repetition_number,
            "ease_factor": task.easiness_factor,
            "interval_days": task.interval_days,
            "estimated_minutes": task.estimated_minutes,
            "scheduled_date": task.next_review_date.isoformat(),
            "status": task.status,
            "completed_today": (
                task.status == "COMPLETED"
                and _reviewed_today(task)
            ),
            "last_reviewed_at": (
                task.last_reviewed_at.isoformat()
                if task.last_reviewed_at
                else None
            ),
        }

    # --------------------------------------------------------
    # Return revision plan
    # --------------------------------------------------------

    return {
        "student_id": student_id,
        "max_daily_minutes": settings.max_daily_minutes,
        "today_minutes": today_minutes,
        "today_count": len(today_tasks),
        "completed_today_count": len(completed_today),

        "today_tasks": [
            format_task(task)
            for task in today_tasks
        ],

        "completed_today": [
            format_task(task)
            for task in completed_today
        ],

        "upcoming_tasks": [
            format_task(task)
            for task in upcoming_tasks
        ],

        "all_tasks": [
            format_task(task)
            for task in tasks
        ],
    }


# ============================================================
# RECORD TOPIC REVIEW
# ============================================================

def record_topic_review(
    db: Session,
    student_id: str,
    schedule_id: str,
    quality_score: int,
):
    """
    Execute SM-2 review for a revision task.

    Steps:
    1. Calculate new SM-2 values.
    2. Update repetition.
    3. Update ease factor.
    4. Update interval.
    5. Schedule next review.
    6. Mark current review as completed.
    7. Update StudentMastery.
    8. Clear struggle cache.
    """

    # --------------------------------------------------------
    # Find revision schedule
    # --------------------------------------------------------

    schedule = (
        db.query(RevisionSchedule)
        .filter(
            RevisionSchedule.id == schedule_id,
            RevisionSchedule.student_id == student_id,
        )
        .first()
    )

    if not schedule:
        raise ValueError(
            "Revision task not found."
        )

    # --------------------------------------------------------
    # Calculate SM-2
    # --------------------------------------------------------

    new_rep, new_ef, new_interval = calculate_sm2(
        repetition=schedule.repetition_number,
        ease_factor=schedule.easiness_factor,
        interval_days=schedule.interval_days,
        quality=quality_score,
    )

    now_time = datetime.now(timezone.utc)
    today = date.today()

    # --------------------------------------------------------
    # Update schedule
    # --------------------------------------------------------

    schedule.repetition_number = new_rep
    schedule.easiness_factor = new_ef
    schedule.interval_days = new_interval
    schedule.last_reviewed_at = now_time

    # IMPORTANT:
    # Use new_interval, not undefined interval_days
    schedule.next_review_date = (
        today + timedelta(days=new_interval)
    )

    schedule.status = "COMPLETED"

    # --------------------------------------------------------
    # Update StudentMastery
    # --------------------------------------------------------

    mastery = (
        db.query(StudentMastery)
        .filter(
            StudentMastery.student_id == student_id,
            StudentMastery.topic == schedule.topic,
        )
        .first()
    )

    if mastery:

        questions_added = 5

        if quality_score >= 3:
            correct_added = 5
        else:
            correct_added = max(
                1,
                quality_score,
            )

        mastery.total_questions = (
            mastery.total_questions or 0
        ) + questions_added

        mastery.correct_answers = (
            mastery.correct_answers or 0
        ) + correct_added

        mastery.mastery_score = round(
            mastery.correct_answers
            / mastery.total_questions,
            4,
        )

        # ----------------------------------------------------
        # Save mastery history
        # ----------------------------------------------------

        history = StudentMasteryHistory(
            student_id=student_id,
            mastery_id=mastery.mastery_id,
            subject=mastery.subject,
            topic=mastery.topic,
            mastery_score=mastery.mastery_score,
            source_type="revision_sm2",
            source_id=str(schedule_id),
        )

        db.add(history)

    # --------------------------------------------------------
    # Clear struggle cache
    # --------------------------------------------------------

    try:

        from app.services.mastery_service import redis_client

        redis_client.delete(
            f"struggles:{student_id}"
        )

    except Exception:
        pass

    # --------------------------------------------------------
    # Save changes
    # --------------------------------------------------------

    db.commit()
    db.refresh(schedule)

    return schedule


# ============================================================
# UPDATE REVISION SETTINGS
# ============================================================

def update_revision_settings(
    db: Session,
    student_id: str,
    max_daily_minutes: int,
):
    """
    Update student's daily workload capacity
    and rebalance the revision plan.
    """

    settings = get_or_create_settings(
        db,
        student_id,
    )

    # Keep allowed range between 15 and 240 minutes
    settings.max_daily_minutes = max(
        15,
        min(240, int(max_daily_minutes)),
    )

    db.commit()
    db.refresh(settings)

    # Rebalance existing tasks
    balance_workload(
        db,
        student_id,
    )

    return settings
