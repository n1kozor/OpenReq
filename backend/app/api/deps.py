from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import decode_access_token, hash_password
from app.database import get_db
from app.models.environment import Environment, EnvironmentType
from app.models.user import User, RoleEnum
from app.models.workspace import Workspace, WorkspaceMember

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if settings.STANDALONE_MODE:
        return _ensure_standalone_user(db, credentials)

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing credentials",
        )
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


def _ensure_standalone_user(db: Session, credentials: HTTPAuthorizationCredentials | None) -> User:
    if credentials:
        payload = decode_access_token(credentials.credentials)
        if payload:
            existing = db.query(User).filter(User.id == payload["sub"]).first()
            if existing and existing.is_active:
                return existing

    user = db.query(User).filter(User.is_active.is_(True)).first()
    if not user:
        user = User(
            email="local@openreq",
            username="local",
            hashed_password=hash_password("local"),
            full_name="Local User",
            is_active=True,
        )
        db.add(user)
        db.flush()

    ws = db.query(Workspace).first()
    if not ws:
        ws = Workspace(name="Local Workspace")
        db.add(ws)
        db.flush()

    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
        WorkspaceMember.user_id == user.id,
    ).first()
    if not member:
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=RoleEnum.ADMIN))

    env_count = db.query(Environment).filter(Environment.workspace_id == ws.id).count()
    if env_count == 0:
        db.add_all([
            Environment(name="Local", env_type=EnvironmentType.DEV, workspace_id=ws.id),
            Environment(name="Test", env_type=EnvironmentType.TEST, workspace_id=ws.id),
            Environment(name="Live", env_type=EnvironmentType.LIVE, workspace_id=ws.id),
        ])

    db.commit()
    db.refresh(user)
    return user
