"""Authenticated CRUD endpoints for collection share links."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import hash_password
from app.database import get_db
from app.models.collection import Collection
from app.models.collection_share import CollectionShare
from app.models.user import User
from app.schemas.share import ShareCreate, ShareUpdate, ShareOut

router = APIRouter()


def _share_to_out(share: CollectionShare) -> dict:
    return {
        "id": share.id,
        "token": share.token,
        "collection_id": share.collection_id,
        "folder_id": share.folder_id,
        "title": share.title,
        "description_override": share.description_override,
        "has_password": share.password_hash is not None,
        "is_active": share.is_active,
        "view_count": share.view_count,
        "expires_at": share.expires_at,
        "created_at": share.created_at,
        "share_url": f"/share/{share.token}",
    }


@router.post("/", response_model=ShareOut)
def create_share(
    data: ShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collection = db.query(Collection).filter(Collection.id == data.collection_id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    share = CollectionShare(
        collection_id=data.collection_id,
        folder_id=data.folder_id,
        created_by=current_user.id,
        title=data.title,
        description_override=data.description_override,
        password_hash=hash_password(data.password) if data.password else None,
        expires_at=data.expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _share_to_out(share)


@router.get("/", response_model=list[ShareOut])
def list_shares(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collection = db.query(Collection).filter(Collection.id == collection_id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    shares = (
        db.query(CollectionShare)
        .filter(CollectionShare.collection_id == collection_id)
        .order_by(CollectionShare.created_at.desc())
        .all()
    )
    return [_share_to_out(s) for s in shares]


@router.patch("/{share_id}", response_model=ShareOut)
def update_share(
    share_id: str,
    data: ShareUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = db.query(CollectionShare).filter(CollectionShare.id == share_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    if data.title is not None:
        share.title = data.title
    if data.description_override is not None:
        share.description_override = data.description_override
    if data.remove_password:
        share.password_hash = None
    elif data.password is not None:
        share.password_hash = hash_password(data.password)
    if data.is_active is not None:
        share.is_active = data.is_active
    if data.expires_at is not None:
        share.expires_at = data.expires_at

    db.commit()
    db.refresh(share)
    return _share_to_out(share)


@router.delete("/{share_id}", status_code=204)
def delete_share(
    share_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = db.query(CollectionShare).filter(CollectionShare.id == share_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    db.delete(share)
    db.commit()
