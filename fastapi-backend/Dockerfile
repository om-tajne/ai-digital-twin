FROM python:3.11-slim

WORKDIR /app

# System dependencies (tesseract + poppler are needed for scanned-PDF OCR, ffmpeg for viva audio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    tesseract-ocr \
    poppler-utils \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install python packages
COPY fastapi-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code & root database module
COPY fastapi-backend /app/fastapi-backend
COPY database /app/database

WORKDIR /app/fastapi-backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
