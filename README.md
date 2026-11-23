# 🤖 AI Digital Twin Full-Stack Monorepo

A modern, high-performance AI Digital Twin application that empowers students through active learning. It features a **React (Vite) Frontend**, dual backends with **Node.js Express API** and **FastAPI Python (Vector Store / AI Processing)**, supported by **PostgreSQL (pgvector)** and **Redis**.

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    User([User Browser]) -->|HTTP :5173| Frontend[React Vite Frontend]
    Frontend -->|REST API :5000| NodeBackend[Node.js Express API]
    Frontend -->|REST API :8000| FastAPIBackend[FastAPI Python API]
    NodeBackend -->|SQL :5434| Postgres[(PostgreSQL + pgvector)]
    FastAPIBackend -->|SQL :5434| Postgres[(PostgreSQL + pgvector)]
    FastAPIBackend -->|Pub/Sub :6379| Redis[(Redis Cache / Queue)]
```

---

## ⚡ Core Features

- **File Ingestion & Background Processing**: 
  - Drag-and-drop PDF upload UI.
  - Background async text extraction using `pdfplumber` & Tesseract OCR via Celery + Redis, preventing UI freezes.
  - Generates 1536-dimensional semantic vector embeddings (via LangChain + Gemini/OpenAI) and stores them in PostgreSQL using `pgvector`.
- **Bayesian Knowledge Tracing (BKT)**: 
  - Tracks and updates student mastery scores dynamically based on quiz results.
  - Provides a real-time mastery progress dashboard for parents and students.
  - Uses Postgres snapshot versioning for historical progress tracking.
- **Struggle Topic Predictor**:
  - Algorithmic ranking of weak topics based on: `(1 - Mastery) × Syllabus Weight × Time Decay`.
  - Node.js layer utilizes Redis caching to swiftly render a "Top Struggles" widget on the student dashboard.
- **Grounded RAG Quiz Engine**:
  - Auto-generates multi-choice quizzes strictly grounded in the student's uploaded notes.
  - Uses LangChain RAG vector retrieval (`cosine_distance` over `pgvector`) to find relevant material.
  - Connects to Gemini 1.5 Flash to generate structured JSON containing questions, exact answers, explanations, and precise source citations.

---

## 📂 Project Structure

```text
ai-digital-twin/
├── database/
│   ├── migrations/
│   │   └── init.sql         # PostgreSQL schema & pgvector initialization
│   ├── models.py            # SQLAlchemy ORM Models
│   ├── seed_syllabus_weights.py # DB Seeding script for syllabus
│   └── session.py           # DB connection session factory
├── fastapi-backend/
│   ├── app/                 # FastAPI app & routes (RAG, BKT, LLM, services)
│   ├── tests/               # Pytest test suites
│   ├── worker/              # Celery background tasks for PDF extraction
│   ├── Dockerfile
│   └── requirements.txt     # Python dependencies
├── node-backend/
│   ├── models/              # Express models (e.g., Payment)
│   ├── src/                 # Express controllers, routes, Redis caching
│   ├── Dockerfile
│   └── package.json         # Node.js dependencies
├── frontend/
│   ├── public/              # Static assets
│   ├── src/                 # React UI (Dashboard, Auth, Uploads, Services)
│   ├── Dockerfile
│   ├── package.json         # React dependencies
│   └── vite.config.js       # Vite configuration
├── fix_*.py                 # Utility python scripts to clean codebase
├── test_revision.py         # Utility script for testing revisions
├── reset_student_password.py # Utility script to reset student passwords
├── docker-compose.yml       # Multi-container orchestrator
├── package.json             # Root monorepo scripts
├── start.bat                # Windows one-click launcher script
├── .env.example             # Template for environment variables
├── .gitignore               # Git ignored files
├── .dockerignore            # Docker ignored files
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18+)
- **Python** (v3.10+)
- **Docker Desktop** (running)

---

### Environment Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ai-digital-twin
   ```

2. Copy the example `.env` file:
   ```bash
   cp .env.example .env
   ```

---

### 🏃 Running the Application ("In One Go")

#### Method 1: Standard Development Mode (Recommended)

Run the one-click startup script (or `npm start`):

**On Windows:**
```cmd
start.bat
```
or via npm:
```bash
npm start
```

This command automatically:
1. Starts PostgreSQL (`:5434`) and Redis (`:6379`) via Docker.
2. Launches Node.js API (`:5000`), FastAPI (`:8000`), and React Frontend (`:5173`) concurrently.

---

#### Method 2: Full Docker Container Mode

To run all services fully containerized inside Docker:

```bash
npm run docker:up
```
*(or `docker compose up --build`)*

To stop all containers:
```bash
npm run docker:down
```

---

## 🌐 Service URLs & Health Endpoints

| Service | Local URL | Description |
| :--- | :--- | :--- |
| **Frontend** | `http://localhost:5173` | React UI (Dashboard, Quiz, Library) |
| **Node.js API** | `http://localhost:5000` | Primary Express Backend & Auth |
| **FastAPI** | `http://localhost:8000` | Python AI Backend, RAG, & BKT |
| **PostgreSQL** | `localhost:5434` | `twin_db` database |
| **Redis** | `localhost:6379` | Cache & Queue |

---

## 🛠️ API Quick Reference

### Node.js Backend (`http://localhost:5000`)
- `POST /api/login` - Authenticate users
- `POST /api/students` - Create a student profile
- `GET /api/students` - Get all students
- `GET /api/students/:student_id/top-struggles` - Ranked struggle predictions (Redis cached)
- `POST /api/create-order` - Create Razorpay payment order
- `POST /api/verify` - Verify Razorpay payment
- `POST /api/webhook` - Razorpay webhook handler

### FastAPI Backend (`http://localhost:8000`)
- `POST /api/v1/login` - FastAPI authentication
- `POST /api/v1/students` - Create a student profile
- `POST /api/v1/upload-pdf` - Async PDF parsing and chunking
- `POST /api/v1/tests/generate` - RAG-based LLM Quiz Generation
- `POST /api/v1/tests/{test_id}/submit` - Submit test and evaluate score
- `POST /api/v1/mastery/update` - BKT Mastery engine updates
- `GET /api/v1/mastery/{student_id}` - Get student's overall mastery data
- `GET /api/v1/struggle-data/{student_id}` - Detailed struggle topic metrics
- `GET /api/v1/revision/{student_id}/plan` - Get SM-2 spaced repetition revision plan
- *(Also includes Viva voice Q&A and Guardian access routes)*

---

## 📜 License

ISC License
