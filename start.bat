@echo off
echo ============================================================
echo   Starting AI Digital Twin Stack in One Go...
echo ============================================================
echo [1/3] Starting Database Services (PostgreSQL ^& Redis)...
docker compose up -d postgres redis

echo [2/3] Launching Node.js Backend, FastAPI Backend, Celery Worker, and Frontend...
npx --yes concurrently --kill-others --names "NODE,FASTAPI,CELERY,FRONTEND" --prefix-colors "blue,green,yellow,magenta" ^
  "npm --prefix node-backend run dev" ^
  "cd fastapi-backend && python -m uvicorn app.main:app --port 8000 --reload" ^
  "cd fastapi-backend && python -m celery -A worker.celery_app worker --loglevel=info --pool=solo" ^
  "npm --prefix frontend run dev"
