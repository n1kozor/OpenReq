from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.app_settings import AppSettings, get_or_create_settings
from app.schemas.app_settings import AppSettingsOut, AppSettingsUpdate

router = APIRouter()


@router.get("/", response_model=AppSettingsOut)
def get_app_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = get_or_create_settings(db)
    return AppSettingsOut(
        has_openai_key=bool(s.openai_api_key),
        openai_api_key_hint=f"...{s.openai_api_key[-4:]}" if s.openai_api_key else None,
    )


@router.patch("/", response_model=AppSettingsOut)
def update_app_settings(
    payload: AppSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = get_or_create_settings(db)
    if payload.openai_api_key is not None:
        s.openai_api_key = payload.openai_api_key if payload.openai_api_key else None
    db.commit()
    db.refresh(s)
    return AppSettingsOut(
        has_openai_key=bool(s.openai_api_key),
        openai_api_key_hint=f"...{s.openai_api_key[-4:]}" if s.openai_api_key else None,
    )
