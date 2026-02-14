from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "OpenReq"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "sqlite:///./data/openreq.db"

    JWT_SECRET_KEY: str = "super-secret-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    # Set to 0 or a negative value to disable expiration (tokens never expire)
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    CORS_ORIGINS: str = "http://localhost:5173"

    PROXY_REQUEST_TIMEOUT: int = 30

    ALLOW_REGISTRATION: bool = True

    OPENAI_API_KEY: str | None = None

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
