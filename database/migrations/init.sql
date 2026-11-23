-- Docker runs this once, only when the Postgres volume is first created.
-- Tables are NOT created here on purpose: the FastAPI backend builds and
-- upgrades every table from database/models.py (see database/schema.py), so
-- there is a single source of truth and no schema drift.
CREATE EXTENSION IF NOT EXISTS vector;
