import sys
import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text


# ============================================================
# PROJECT ROOT
# ============================================================

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../..")
    )
)


# ============================================================
# DATABASE
# ============================================================

from database.session import get_db, Base, engine

# Import models so SQLAlchemy registers all tables
from database import models
from database.schema import init_database


# ============================================================
# API ROUTES
# ============================================================

from app.api.routes import router as api_router

# ============================================================
# VIVA ROUTES
# ============================================================

from app.routes.viva_routes import router as viva_router

# ============================================================
# GUARDIAN ROUTES
# ============================================================

from app.routes.guardian_routes import router as guardian_router


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="AI Digital Twin API",
    description="Backend API for AI Digital Twin for Students",
    version="1.0.0",
)


# ============================================================
# CREATE DATABASE TABLES
# ============================================================

try:
    init_database(engine, Base)
except Exception as exc:
    print(
        "\n❌ Cannot set up the database: "
        f"{str(exc).splitlines()[0]}\n"
        "   Is Postgres running? Start it with:  docker compose up -d postgres\n"
        "   and check DATABASE_URL in your .env file.\n"
    )
    raise


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# API ROUTER
# ============================================================

app.include_router(
    api_router,
    prefix="/api/v1",
)


# ============================================================
# VIVA ROUTER
# ============================================================

app.include_router(
    viva_router,
    prefix="/api/v1",
)


# ============================================================
# GUARDIAN ROUTER
# ============================================================

app.include_router(
    guardian_router,
    prefix="/api/v1",
)


# ============================================================
# ROOT ENDPOINT
# ============================================================

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "AI Digital Twin FastAPI Backend is running!",
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check(
    db: Session = Depends(get_db),
):
    try:

        db.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {str(e)}",
        )

