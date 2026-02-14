from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.history import RequestHistory
from app.models.user import User
from app.schemas.history import HistoryOut, HistoryDetailOut

router = APIRouter()


@router.get("/", response_model=list[HistoryOut])
def list_history(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(RequestHistory)
        .filter(RequestHistory.user_id == current_user.id)
        .order_by(RequestHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{history_id}", response_model=HistoryDetailOut)
def get_history(
    history_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = (
        db.query(RequestHistory)
        .filter(RequestHistory.id == history_id, RequestHistory.user_id == current_user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    return entry


@router.delete("/", status_code=204)
def clear_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(RequestHistory).filter(RequestHistory.user_id == current_user.id).delete()
    db.commit()
