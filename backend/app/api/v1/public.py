"""Public (unauthenticated) endpoints for shared documentation."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.core.security import verify_password, decode_access_token, create_access_token
from app.database import get_db
from app.models.collection_share import CollectionShare
from app.schemas.share import SharePublicMeta, ShareDocsData, SharePasswordVerify, ShareSessionToken
from app.services.share_service import get_share_docs_data, get_share_endpoint_count

router = APIRouter()

SHARE_SESSION_EXPIRY = timedelta(hours=1)


def _get_active_share(db: Session, token: str) -> CollectionShare:
    share = (
        db.query(CollectionShare)
        .filter(CollectionShare.token == token)
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if not share.is_active:
        raise HTTPException(status_code=410, detail="This share link has been disabled")
    if share.expires_at and share.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This share link has expired")
    return share


def _verify_share_session(share: CollectionShare, authorization: str | None):
    """Verify share session token for password-protected shares."""
    if not share.password_hash:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Password verification required")
    token = authorization.replace("Bearer ", "")
    payload = decode_access_token(token)
    if not payload or payload.get("type") != "share_session" or payload.get("sub") != share.id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")


@router.get("/share/{token}", response_model=SharePublicMeta)
def get_share_meta(
    token: str,
    db: Session = Depends(get_db),
):
    share = _get_active_share(db, token)
    endpoint_count = get_share_endpoint_count(db, share)
    return SharePublicMeta(
        title=share.title or share.collection.name,
        description=share.description_override or share.collection.description,
        has_password=share.password_hash is not None,
        endpoint_count=endpoint_count,
        collection_name=share.collection.name,
    )


@router.post("/share/{token}/verify", response_model=ShareSessionToken)
def verify_share_password(
    token: str,
    data: SharePasswordVerify,
    db: Session = Depends(get_db),
):
    share = _get_active_share(db, token)
    if not share.password_hash:
        raise HTTPException(status_code=400, detail="This share is not password-protected")
    if not verify_password(data.password, share.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    session_token = create_access_token(
        subject=share.id,
        expires_delta=SHARE_SESSION_EXPIRY,
    )
    # Encode type claim manually since create_access_token doesn't support extra claims
    from jose import jwt
    from app.config import settings
    payload = decode_access_token(session_token)
    payload["type"] = "share_session"
    session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return ShareSessionToken(
        session_token=session_token,
        expires_in=int(SHARE_SESSION_EXPIRY.total_seconds()),
    )


@router.get("/share/{token}/docs", response_model=ShareDocsData)
def get_share_docs(
    token: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    share = _get_active_share(db, token)
    _verify_share_session(share, authorization)

    # Increment view count
    share.view_count = (share.view_count or 0) + 1
    db.commit()

    data = get_share_docs_data(db, share)
    return ShareDocsData(**data)
