from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, create_access_token
from app.database import get_db
from app.models.user import User, RoleEnum
from app.models.workspace import Workspace, WorkspaceMember
from app.models.environment import Environment, EnvironmentType
from app.models.app_settings import AppSettings
from app.schemas.setup import (
    SetupStatusResponse,
    SetupInitializeRequest,
    SetupInitializeResponse,
)

router = APIRouter()


@router.get("/status", response_model=SetupStatusResponse)
def get_setup_status(db: Session = Depends(get_db)):
    user_count = db.query(User).count()
    return SetupStatusResponse(setup_required=user_count == 0)


@router.post(
    "/initialize",
    response_model=SetupInitializeResponse,
    status_code=status.HTTP_201_CREATED,
)
def initialize_setup(
    payload: SetupInitializeRequest, db: Session = Depends(get_db)
):
    # Only allow when no users exist yet
    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Setup already completed",
        )

    # Check for duplicate email/username (defensive)
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")

    # Create admin user
    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.flush()

    # Store AI settings globally
    has_ai_config = (
        payload.openai_api_key
        or (payload.ai_provider and payload.ai_provider != "openai")
        or payload.ollama_base_url
    )
    if has_ai_config:
        app_settings = AppSettings(
            openai_api_key=payload.openai_api_key,
            ai_provider=payload.ai_provider or "openai",
            ollama_base_url=payload.ollama_base_url,
            ollama_model=payload.ollama_model,
        )
        db.add(app_settings)
        db.flush()

    # Create workspace
    ws = Workspace(name=payload.workspace_name)
    db.add(ws)
    db.flush()

    # Add admin to workspace
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=RoleEnum.ADMIN))
    db.flush()

    # Create environments for the workspace
    env_type_map = {"LIVE": EnvironmentType.LIVE, "TEST": EnvironmentType.TEST, "DEV": EnvironmentType.DEV}
    for env in payload.environments:
        db.add(Environment(
            name=env.name,
            env_type=env_type_map[env.env_type],
            workspace_id=ws.id,
        ))

    db.commit()
    db.refresh(user)

    # Generate JWT token for auto-login
    token = create_access_token(subject=user.id)
    return SetupInitializeResponse(access_token=token, user=user)
