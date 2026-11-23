import os
import sys
from pathlib import Path
import logging

# Ensure project root and fastapi-backend are in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
for p in (str(ROOT_DIR), str(BASE_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

try:
    from celery import Celery

    celery_app = Celery(
        "ai_digital_twin",
        broker=f"{REDIS_URL}/0",   # queue: where tasks wait to be picked up
        backend=f"{REDIS_URL}/1",  # result store: where task status/results live
        include=["worker.tasks"],
    )

    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
    )
except ImportError:
    logger.warning("Celery is not installed. Background Celery tasks will operate in mock mode.")
    
    class DummyTaskResult:
        def __init__(self, task_id: str):
            self.id = task_id
            self.status = "SUCCESS"
            self.result = {"status": "mocked", "detail": "Celery not installed"}
        def ready(self):
            return True

    class DummyCeleryApp:
        def AsyncResult(self, task_id: str):
            return DummyTaskResult(task_id)

    celery_app = DummyCeleryApp()