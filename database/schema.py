"""Database bootstrap shared by every backend.

`init_database()` makes a database of ANY age match the SQLAlchemy models:
  1. enables the pgvector extension,
  2. creates every missing table,
  3. adds every missing column to tables that already exist
     (create_all never alters existing tables, which used to break fresh and
     old databases alike - e.g. students.is_pro, knowledge_chunks.document_id),
  4. creates the vector search index.
It is idempotent, so it is safe to run on every startup.
"""
import logging

from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def _default_clause(column):
    """SQL DEFAULT for simple python-side defaults (e.g. Boolean default=False)."""
    default = getattr(column.default, "arg", None)
    if isinstance(default, bool):
        return " DEFAULT TRUE" if default else " DEFAULT FALSE"
    if isinstance(default, (int, float)):
        return f" DEFAULT {default}"
    if isinstance(default, str):
        return " DEFAULT '" + default.replace("'", "''") + "'"
    if column.server_default is not None and hasattr(column.server_default.arg, "text"):
        return f" DEFAULT {column.server_default.arg.text}"
    return ""


def _add_missing_columns(engine, Base):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    added = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                sql = f'ALTER TABLE "{table.name}" ADD COLUMN IF NOT EXISTS "{column.name}" {col_type}'
                sql += _default_clause(column)
                for fk in column.foreign_keys:
                    sql += f' REFERENCES "{fk.column.table.name}" ("{fk.column.name}")'
                    if fk.ondelete:
                        sql += f" ON DELETE {fk.ondelete}"
                    break
                conn.execute(text(sql))
                added.append(f"{table.name}.{column.name}")
    return added


def _relax_legacy_columns(engine, Base):
    """
    Columns that exist in an old database but no longer in the models (e.g. a
    renamed `scheduled_date`) may be NOT NULL without a default, which makes
    every INSERT fail. Make them nullable so old databases keep working.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    relaxed = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            wanted = {c.name for c in table.columns}
            for col in inspector.get_columns(table.name):
                if col["name"] in wanted or col["nullable"] or col.get("default") is not None:
                    continue
                if col.get("autoincrement") or col.get("identity"):
                    continue
                conn.execute(text(f'ALTER TABLE "{table.name}" ALTER COLUMN "{col["name"]}" DROP NOT NULL'))
                relaxed.append(f"{table.name}.{col['name']}")
    return relaxed


def init_database(engine, Base):
    # 1. pgvector (needs a pgvector-enabled Postgres, e.g. the pgvector/pgvector Docker image)
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as err:  # noqa: BLE001
        logger.warning(
            "Could not enable the pgvector extension (%s). Use a pgvector-enabled "
            "Postgres (docker compose up -d postgres).", str(err).splitlines()[0]
        )

    # 2. missing tables, 3. missing columns on old tables
    Base.metadata.create_all(bind=engine)
    added = _add_missing_columns(engine, Base)
    if added:
        logger.info("Database upgraded - added columns: %s", ", ".join(added))
    relaxed = _relax_legacy_columns(engine, Base)
    if relaxed:
        logger.info("Relaxed legacy NOT NULL columns: %s", ", ".join(relaxed))

    # 4. vector index for fast RAG retrieval
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx "
                "ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)"
            ))
    except Exception as err:  # noqa: BLE001
        logger.warning("Skipped vector index: %s", str(err).splitlines()[0])
