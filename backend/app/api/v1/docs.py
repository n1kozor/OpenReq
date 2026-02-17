"""API Documentation Generator endpoint — SSE streaming."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.collection import Collection
from app.models.app_settings import get_or_create_settings
from app.models.user import User
from app.services.ai_generator import AIProviderConfig
from app.services.doc_generator import DocRequest, generate_documentation_stream

router = APIRouter()


class GenerateDocsRequest(BaseModel):
    collection_id: str
    folder_id: str | None = None
    doc_language: str = "en"
    use_ai: bool = False
    extra_prompt: str | None = None
    include_sdk: bool = False
    sdk_languages: list[str] | None = None
    provider: str | None = None
    model: str | None = None


@router.post("/generate")
async def generate_docs(
    payload: GenerateDocsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate API documentation for a collection or folder via SSE streaming."""
    collection = db.query(Collection).filter(Collection.id == payload.collection_id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    if collection.owner_id != current_user.id and collection.visibility != "shared":
        raise HTTPException(status_code=403, detail="Access denied")

    # Build AI config only if AI enrichment is requested
    config: AIProviderConfig | None = None
    if payload.use_ai:
        settings = get_or_create_settings(db)
        provider = payload.provider or settings.ai_provider or "openai"

        if provider == "ollama":
            config = AIProviderConfig(
                provider="ollama",
                base_url=settings.ollama_base_url or "http://localhost:11434",
                model=payload.model or settings.ollama_model,
            )
        else:
            api_key = settings.openai_api_key
            if not api_key:
                from app.core.config import settings as app_cfg
                api_key = app_cfg.OPENAI_API_KEY
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI API key not configured")
            config = AIProviderConfig(
                provider="openai",
                api_key=api_key,
                model=payload.model or settings.openai_model,
            )

    doc_req = DocRequest(
        collection_id=payload.collection_id,
        folder_id=payload.folder_id,
        doc_language=payload.doc_language,
        use_ai=payload.use_ai,
        extra_prompt=payload.extra_prompt,
        include_sdk=payload.include_sdk,
        sdk_languages=payload.sdk_languages or [],
    )

    return StreamingResponse(
        generate_documentation_stream(db, doc_req, config),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
