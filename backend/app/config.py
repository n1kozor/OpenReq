import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "OpenReq"
    APP_VERSION: str = "1.0.4"
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "sqlite:///./data/openreq.db"
    STANDALONE_MODE: bool = False

    JWT_SECRET_KEY: str = "super-secret-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    # Set to 0 or a negative value to disable expiration (tokens never expire)
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 0  # Never expire

    CORS_ORIGINS: str = "http://localhost:5173"

    PROXY_REQUEST_TIMEOUT: int = 30

    ALLOW_REGISTRATION: bool = True

    OPENAI_API_KEY: str | None = None

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

_standalone_flag = os.getenv("OPENREQ_STANDALONE", "").lower()
if _standalone_flag in ("1", "true", "yes", "on"):
    settings.STANDALONE_MODE = True

_db_path = os.getenv("OPENREQ_DB_PATH")
if _db_path:
    db_path = Path(_db_path).expanduser().resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    settings.DATABASE_URL = f"sqlite:///{db_path.as_posix()}"
else:
    _data_dir = os.getenv("OPENREQ_DATA_DIR")
    if _data_dir:
        data_dir = Path(_data_dir).expanduser().resolve()
        data_dir.mkdir(parents=True, exist_ok=True)
        settings.DATABASE_URL = f"sqlite:///{(data_dir / 'openreq.db').as_posix()}"
