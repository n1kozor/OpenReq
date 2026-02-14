"""SDK Generator API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.collection import Collection
from app.services.sdk_generator import generate_sdk

router = APIRouter()


class GenerateSDKRequest(BaseModel):
    collection_id: str
    language: str  # "csharp" or "python"


@router.post("/generate")
def generate_sdk_endpoint(
    payload: GenerateSDKRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate SDK for a collection.

    Supports C# and Python SDK generation.
    """
    # Verify collection exists and user has access
    collection = db.query(Collection).filter(Collection.id == payload.collection_id).first()
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Check access (owner or shared)
    if collection.owner_id != current_user.id and collection.visibility != "shared":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Validate language
    if payload.language not in ("csharp", "python"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Language must be 'csharp' or 'python'",
        )

    try:
        filename, zip_bytes = generate_sdk(db, payload.collection_id, payload.language)

        # Return as downloadable ZIP file
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SDK generation failed: {str(e)}",
        )
