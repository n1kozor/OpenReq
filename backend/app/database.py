import logging
import uuid
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

# Ensure the SQLite parent directory exists
db_path = settings.DATABASE_URL.replace("sqlite:///", "")
Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite-specific
    echo=settings.ENVIRONMENT == "development",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_migrations():
    """Add missing columns to existing tables (SQLite has no ALTER support in create_all)."""
    inspector = inspect(engine)
    migrations: list[tuple[str, str, str]] = [
        ("requests", "pre_request_script", "TEXT"),
        ("requests", "post_response_script", "TEXT"),
        ("collections", "variables", "TEXT DEFAULT '{}'"),
        ("collections", "auth_type", "VARCHAR(20)"),
        ("collections", "auth_config", "TEXT"),
        ("collections", "pre_request_script", "TEXT"),
        ("collections", "post_response_script", "TEXT"),
        ("collections", "script_language", "VARCHAR(20) DEFAULT 'python'"),
        ("app_settings", "ai_provider", "VARCHAR(20) DEFAULT 'openai'"),
        ("app_settings", "ollama_base_url", "VARCHAR(500)"),
        ("app_settings", "ollama_model", "VARCHAR(200)"),
        ("ai_conversations", "is_shared", "BOOLEAN DEFAULT 0"),
        ("ai_conversations", "workspace_id", "VARCHAR(36)"),
    ]
    for table, column, col_type in migrations:
        if table in inspector.get_table_names():
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                logger.info("Added column %s.%s", table, column)

    # Drop orphaned team tables (FK order: team_members first, then teams)
    for table_name in ["team_members", "teams"]:
        if table_name in inspector.get_table_names():
            with engine.begin() as conn:
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            logger.info("Dropped orphaned table %s", table_name)

    # Migrate openai_api_key from first user to app_settings (one-time)
    if "app_settings" in inspector.get_table_names() and "users" in inspector.get_table_names():
        with engine.begin() as conn:
            existing_settings = conn.execute(text("SELECT COUNT(*) FROM app_settings")).scalar()
            if existing_settings == 0:
                # Check if users table has the old openai_api_key column
                user_cols = {c["name"] for c in inspector.get_columns("users")}
                if "openai_api_key" in user_cols:
                    row = conn.execute(text(
                        "SELECT openai_api_key FROM users WHERE openai_api_key IS NOT NULL AND openai_api_key != '' LIMIT 1"
                    )).first()
                    if row and row[0]:
                        conn.execute(text(
                            "INSERT INTO app_settings (id, openai_api_key) VALUES (:id, :key)"
                        ), {"id": str(uuid.uuid4()), "key": row[0]})
                        logger.info("Migrated OpenAI API key to app_settings")


def create_tables():
    Base.metadata.create_all(bind=engine)
    _run_migrations()
