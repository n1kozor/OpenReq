import json as json_lib
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.ai_chat import AIConversation, AIChatMessage
from app.models.app_settings import get_or_create_settings
from app.models.user import User
from app.services.ai_generator import AIProviderConfig
from app.services.ai_chat_service import build_context_text, build_messages, build_collections_summary, stream_chat_response

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──

class CreateConversationRequest(BaseModel):
    title: str = "New conversation"
    provider: str | None = None
    model: str | None = None
    workspace_id: str | None = None


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    is_shared: bool | None = None


class ConversationOut(BaseModel):
    id: str
    title: str
    provider: str
    model: str | None
    is_shared: bool
    workspace_id: str | None
    user_id: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    context_type: str | None
    context_id: str | None
    context_name: str | None
    created_at: str

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str
    context_type: str | None = None  # "collection" | "request"
    context_id: str | None = None
    context_name: str | None = None
    provider: str | None = None
    model: str | None = None


def _to_conversation_out(c: AIConversation) -> ConversationOut:
    return ConversationOut(
        id=c.id,
        title=c.title,
        provider=c.provider or "openai",
        model=c.model,
        is_shared=bool(c.is_shared) if c.is_shared is not None else False,
        workspace_id=c.workspace_id,
        user_id=c.user_id,
        created_at=c.created_at.isoformat() if c.created_at else "",
        updated_at=c.updated_at.isoformat() if c.updated_at else "",
    )


def _to_message_out(m: AIChatMessage) -> MessageOut:
    return MessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role,
        content=m.content,
        context_type=m.context_type,
        context_id=m.context_id,
        context_name=m.context_name,
        created_at=m.created_at.isoformat() if m.created_at else "",
    )


def _build_chat_ai_config(
    db: Session,
    provider_override: str | None = None,
    model_override: str | None = None,
) -> AIProviderConfig:
    """Build AIProviderConfig for chat — uses overrides → app_settings fallback."""
    app_settings = get_or_create_settings(db)
    provider = provider_override or app_settings.ai_provider or "openai"

    if provider == "ollama":
        return AIProviderConfig(
            provider="ollama",
            base_url=app_settings.ollama_base_url or "http://localhost:11434",
            model=model_override or app_settings.ollama_model,
        )

    # OpenAI
    api_key = (app_settings.openai_api_key if app_settings else None) or settings.OPENAI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenAI API key not configured.",
        )
    return AIProviderConfig(
        provider="openai",
        api_key=api_key,
        model=model_override,
    )


# ── Conversation CRUD ──

@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    workspace_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_

    filters = [AIConversation.user_id == current_user.id]

    # Also include shared conversations in the same workspace
    if workspace_id:
        filters.append(
            (AIConversation.is_shared == True)  # noqa: E712
            & (AIConversation.workspace_id == workspace_id)
            & (AIConversation.user_id != current_user.id)
        )

    conversations = (
        db.query(AIConversation)
        .filter(or_(*filters))
        .order_by(AIConversation.updated_at.desc())
        .all()
    )
    return [_to_conversation_out(c) for c in conversations]


@router.post("/conversations", response_model=ConversationOut)
def create_conversation(
    payload: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Resolve default provider/model from app_settings
    app_settings = get_or_create_settings(db)
    provider = payload.provider or app_settings.ai_provider or "openai"
    model = payload.model
    if not model and provider == "ollama":
        model = app_settings.ollama_model

    conv = AIConversation(
        user_id=current_user.id,
        title=payload.title,
        provider=provider,
        model=model,
        workspace_id=payload.workspace_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _to_conversation_out(conv)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: str,
    payload: UpdateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if payload.title is not None:
        conv.title = payload.title
    if payload.is_shared is not None:
        conv.is_shared = payload.is_shared
    db.commit()
    db.refresh(conv)
    return _to_conversation_out(conv)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete messages first (cascade may not work in all SQLite configs)
    db.query(AIChatMessage).filter(AIChatMessage.conversation_id == conversation_id).delete()
    db.delete(conv)
    db.commit()
    return {"ok": True}


# ── Messages ──

@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # Allow access if owner or shared
    if conv.user_id != current_user.id and not conv.is_shared:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = (
        db.query(AIChatMessage)
        .filter(AIChatMessage.conversation_id == conversation_id)
        .order_by(AIChatMessage.created_at.asc())
        .all()
    )
    return [_to_message_out(m) for m in messages]


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # Only the owner can send messages
    if conv.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can send messages")

    if not payload.content or not payload.content.strip():
        raise HTTPException(status_code=400, detail="Message content is required")

    # Resolve provider/model: message-level → conversation-level → app_settings
    provider = payload.provider or conv.provider
    model = payload.model or conv.model
    config = _build_chat_ai_config(db, provider_override=provider, model_override=model)

    # Build context if provided
    context_text = build_context_text(db, payload.context_type, payload.context_id)

    # Build collections summary for AI context
    collections_summary = build_collections_summary(db, current_user.id)

    # Save user message
    user_msg = AIChatMessage(
        conversation_id=conversation_id,
        role="user",
        content=payload.content.strip(),
        context_type=payload.context_type,
        context_id=payload.context_id,
        context_name=payload.context_name,
    )
    db.add(user_msg)

    # Update conversation timestamp
    conv.updated_at = datetime.utcnow()

    # Update conversation provider/model if overridden
    if payload.provider:
        conv.provider = payload.provider
    if payload.model:
        conv.model = payload.model

    db.commit()

    # Load conversation history
    history = (
        db.query(AIChatMessage)
        .filter(AIChatMessage.conversation_id == conversation_id)
        .order_by(AIChatMessage.created_at.asc())
        .all()
    )

    # Build messages (excludes the just-added user msg since it's in history now)
    # Actually history now includes the user_msg, so we pass history[:-1] + let build_messages add the user content
    messages = build_messages(
        history=list(history[:-1]),  # exclude latest user msg — build_messages adds it
        user_content=payload.content.strip(),
        context_text=context_text,
        collections_summary=collections_summary,
        is_ollama=config.provider == "ollama",
    )

    # Store db session info for saving assistant response after streaming
    conv_id = conversation_id

    async def _stream():
        full_response = ""
        try:
            async for delta in stream_chat_response(config, messages):
                full_response += delta
                yield f"data: {json_lib.dumps({'text': delta})}\n\n"
        except Exception as e:
            logger.error("Chat stream error: %s", e)
            yield f"data: {json_lib.dumps({'error': str(e)})}\n\n"

        # Signal done
        yield f"data: {json_lib.dumps({'done': True})}\n\n"

        # Save assistant message to DB
        if full_response.strip():
            try:
                save_db = get_db_session()
                assistant_msg = AIChatMessage(
                    conversation_id=conv_id,
                    role="assistant",
                    content=full_response.strip(),
                )
                save_db.add(assistant_msg)
                # Also update conversation timestamp
                c = save_db.query(AIConversation).filter(AIConversation.id == conv_id).first()
                if c:
                    c.updated_at = datetime.utcnow()
                save_db.commit()
                save_db.close()
            except Exception as e:
                logger.error("Failed to save assistant message: %s", e)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def get_db_session():
    """Get a fresh DB session for post-stream saving."""
    from app.database import SessionLocal
    return SessionLocal()
