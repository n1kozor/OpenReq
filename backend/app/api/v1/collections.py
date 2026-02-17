import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.collection import Collection, CollectionItem, CollectionVisibility
from app.models.user import User
from app.schemas.collection import CollectionCreate, CollectionOut, CollectionItemCreate, CollectionItemOut

router = APIRouter()


def _get_accessible_collection(
    collection_id: str, db: Session, current_user: User
) -> Collection:
    """Return collection if user owns it or is a member of its workspace."""
    from app.models.workspace import WorkspaceMember

    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    if col.owner_id == current_user.id:
        return col
    if col.workspace_id:
        is_member = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == col.workspace_id,
                WorkspaceMember.user_id == current_user.id,
            )
            .first()
        )
        if is_member:
            return col
    raise HTTPException(status_code=404, detail="Collection not found")


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    visibility: CollectionVisibility | None = None
    variables: dict[str, str] | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    pre_request_script: str | None = None
    post_response_script: str | None = None
    script_language: str | None = None


class CollectionItemUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None
    parent_id: str | None = None


class CollectionItemReorder(BaseModel):
    items: list[dict]  # [{"id": "...", "sort_order": 0, "parent_id": "..."}]


@router.post("/", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = Collection(
        name=payload.name,
        description=payload.description,
        visibility=payload.visibility,
        owner_id=current_user.id,
        workspace_id=payload.workspace_id,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


@router.get("/", response_model=list[CollectionOut])
def list_collections(
    workspace_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get user's workspaces
    from app.models.workspace import WorkspaceMember
    workspace_ids = [
        wm.workspace_id for wm in
        db.query(WorkspaceMember).filter(WorkspaceMember.user_id == current_user.id).all()
    ]

    # Show collections: owned by user OR shared in their workspaces
    query = db.query(Collection).filter(
        (Collection.owner_id == current_user.id) |
        ((Collection.visibility == CollectionVisibility.SHARED) & (Collection.workspace_id.in_(workspace_ids)))
    )
    if workspace_id:
        query = query.filter(Collection.workspace_id == workspace_id)
    return query.all()


@router.get("/{collection_id}", response_model=CollectionOut)
def get_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


@router.patch("/{collection_id}", response_model=CollectionOut)
def update_collection(
    collection_id: str,
    payload: CollectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = _get_accessible_collection(collection_id, db, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(col, field, value)
    db.commit()
    db.refresh(col)
    return col


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = _get_accessible_collection(collection_id, db, current_user)
    db.delete(col)
    db.commit()


class DuplicateCollectionRequest(BaseModel):
    name: str


@router.post("/{collection_id}/duplicate", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
def duplicate_collection(
    collection_id: str,
    payload: DuplicateCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.request import Request

    original = _get_accessible_collection(collection_id, db, current_user)

    new_name = payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required")
    if new_name == original.name:
        raise HTTPException(status_code=400, detail="Name must be different from the original")

    # Create new collection
    new_col = Collection(
        name=new_name,
        description=original.description,
        visibility=original.visibility,
        owner_id=current_user.id,
        workspace_id=original.workspace_id,
        variables=dict(original.variables) if original.variables else None,
        auth_type=original.auth_type,
        auth_config=dict(original.auth_config) if original.auth_config else None,
        pre_request_script=original.pre_request_script,
        post_response_script=original.post_response_script,
        script_language=original.script_language,
    )
    db.add(new_col)
    db.flush()

    # Load all items for this collection
    items = (
        db.query(CollectionItem)
        .filter(CollectionItem.collection_id == collection_id)
        .order_by(CollectionItem.sort_order)
        .all()
    )

    # Map old item IDs to new item IDs
    item_id_map: dict[str, str] = {}
    for item in items:
        item_id_map[item.id] = str(uuid.uuid4())

    # Clone items and their linked requests
    for item in items:
        new_request_id = None
        if item.request_id:
            # Deep-clone the request
            orig_req = db.query(Request).filter(Request.id == item.request_id).first()
            if orig_req:
                new_req = Request(
                    name=orig_req.name,
                    method=orig_req.method,
                    url=orig_req.url,
                    headers=dict(orig_req.headers) if orig_req.headers else None,
                    body=orig_req.body,
                    body_type=orig_req.body_type,
                    auth_type=orig_req.auth_type,
                    auth_config=dict(orig_req.auth_config) if orig_req.auth_config else None,
                    query_params=dict(orig_req.query_params) if orig_req.query_params else None,
                    pre_request_script=orig_req.pre_request_script,
                    post_response_script=orig_req.post_response_script,
                    form_data=list(orig_req.form_data) if orig_req.form_data else None,
                    settings=dict(orig_req.settings) if orig_req.settings else None,
                )
                db.add(new_req)
                db.flush()
                new_request_id = new_req.id

        new_item = CollectionItem(
            id=item_id_map[item.id],
            collection_id=new_col.id,
            parent_id=item_id_map.get(item.parent_id) if item.parent_id else None,
            is_folder=item.is_folder,
            name=item.name,
            sort_order=item.sort_order,
            request_id=new_request_id,
        )
        db.add(new_item)

    db.commit()
    db.refresh(new_col)
    return new_col


@router.post("/{collection_id}/items", response_model=CollectionItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    collection_id: str,
    payload: CollectionItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = CollectionItem(
        collection_id=collection_id,
        name=payload.name,
        is_folder=payload.is_folder,
        parent_id=payload.parent_id,
        request_id=payload.request_id,
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{collection_id}/items", response_model=list[CollectionItemOut])
def list_items(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.request import Request

    items = (
        db.query(CollectionItem)
        .filter(CollectionItem.collection_id == collection_id)
        .order_by(CollectionItem.sort_order)
        .all()
    )
    # Batch-load methods for items that have a request
    request_ids = [i.request_id for i in items if i.request_id]
    methods: dict[str, str] = {}
    if request_ids:
        rows = db.query(Request.id, Request.method).filter(Request.id.in_(request_ids)).all()
        methods = {r.id: r.method.value if hasattr(r.method, "value") else r.method for r in rows}
    result = []
    for item in items:
        out = CollectionItemOut.model_validate(item)
        if item.request_id and item.request_id in methods:
            out.method = methods[item.request_id]
        result.append(out)
    return result


@router.patch("/items/{item_id}", response_model=CollectionItemOut)
def update_item(
    item_id: str,
    payload: CollectionItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CollectionItem).filter(CollectionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CollectionItem).filter(CollectionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


@router.put("/{collection_id}/reorder")
def reorder_items(
    collection_id: str,
    payload: CollectionItemReorder,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for entry in payload.items:
        item = db.query(CollectionItem).filter(
            CollectionItem.id == entry["id"],
            CollectionItem.collection_id == collection_id,
        ).first()
        if item:
            item.sort_order = entry.get("sort_order", 0)
            if "parent_id" in entry:
                item.parent_id = entry["parent_id"]
    db.commit()
    return {"status": "ok"}
