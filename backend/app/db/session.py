"""SQLAlchemy engine, session factory, and database initialization helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DATABASE_URL, DATA_DIR, OUTPUTS_DIR, SUPABASE_KEY, SUPABASE_URL
from app.db.models import Base, User


def _build_engine(db_url: str) -> Engine:
    normalized_url = db_url
    if normalized_url.startswith("postgres://"):
        normalized_url = normalized_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif normalized_url.startswith("postgresql://") and not normalized_url.startswith("postgresql+"):
        normalized_url = normalized_url.replace("postgresql://", "postgresql+psycopg://", 1)

    connect_args = {}
    if normalized_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        if normalized_url != "sqlite:///:memory:" and ":///" in normalized_url:
            raw_path = normalized_url.split(":///", 1)[1]
            if raw_path and raw_path != ":memory:":
                Path(raw_path).parent.mkdir(parents=True, exist_ok=True)

    eng = create_engine(
        normalized_url,
        connect_args=connect_args,
        pool_pre_ping=True,
        future=True,
    )

    if normalized_url.startswith("sqlite"):

        @event.listens_for(eng, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return eng


engine: Engine = _build_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def init_db() -> None:
    """Ensure local data directories exist and create all database tables."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    tables = list(Base.metadata.tables.values())
    if engine.dialect.name == "postgresql" and SUPABASE_URL and SUPABASE_KEY:
        # Supabase manages auth.users directly; keep public schema limited to app tables.
        tables = [t for t in tables if t.name != User.__tablename__]
    Base.metadata.create_all(bind=engine, tables=tables)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped SQLAlchemy Session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
