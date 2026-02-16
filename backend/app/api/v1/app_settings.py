import logging

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.app_settings import get_or_create_settings
from app.schemas.app_settings import AppSettingsOut, AppSettingsUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


class OllamaModelOut(BaseModel):
    name: str
    size: int | None = None
    modified_at: str | None = None


def _build_settings_out(s) -> AppSettingsOut:
    return AppSettingsOut(
        has_openai_key=bool(s.openai_api_key),
        openai_api_key_hint=f"...{s.openai_api_key[-4:]}" if s.openai_api_key else None,
        ai_provider=s.ai_provider or "openai",
        ollama_base_url=s.ollama_base_url,
        ollama_model=s.ollama_model,
        has_ollama_url=bool(s.ollama_base_url),
    )


@router.get("/", response_model=AppSettingsOut)
def get_app_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = get_or_create_settings(db)
    return _build_settings_out(s)


@router.patch("/", response_model=AppSettingsOut)
def update_app_settings(
    payload: AppSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = get_or_create_settings(db)
    if payload.openai_api_key is not None:
        s.openai_api_key = payload.openai_api_key if payload.openai_api_key else None
    if payload.ai_provider is not None:
        s.ai_provider = payload.ai_provider
    if payload.ollama_base_url is not None:
        s.ollama_base_url = payload.ollama_base_url if payload.ollama_base_url else None
    if payload.ollama_model is not None:
        s.ollama_model = payload.ollama_model if payload.ollama_model else None
    db.commit()
    db.refresh(s)
    return _build_settings_out(s)


@router.get("/ollama-models", response_model=list[OllamaModelOut])
def get_ollama_models(
    base_url: str = Query(default="http://localhost:11434"),
    current_user: User = Depends(get_current_user),
):
    """Fetch available models from an Ollama server."""
    url = base_url.rstrip("/") + "/api/tags"
    try:
        resp = httpx.get(url, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        models = data.get("models", [])
        return [
            OllamaModelOut(
                name=m.get("name", ""),
                size=m.get("size"),
                modified_at=m.get("modified_at"),
            )
            for m in models
        ]
    except Exception as e:
        logger.warning("Failed to fetch Ollama models from %s: %s", url, e)
        return []
