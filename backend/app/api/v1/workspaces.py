from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rbac import check_workspace_role
from app.database import get_db
from app.models.user import User, RoleEnum
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, WorkspaceMemberAdd

router = APIRouter()


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GlobalsUpdate(BaseModel):
    globals: dict[str, str]


class MemberOut(BaseModel):
    id: str
    user_id: str
    role: RoleEnum
    username: str | None = None
    email: str | None = None

    model_config = {"from_attributes": True}


@router.post("/", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ws = Workspace(name=payload.name, description=payload.description)
    db.add(ws)
    db.flush()
    member = WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role=RoleEnum.ADMIN)
    db.add(member)
    db.commit()
    db.refresh(ws)
    return ws


@router.get("/", response_model=list[WorkspaceOut])
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_ids = (
        db.query(WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == current_user.id)
        .subquery()
    )
    workspaces = db.query(Workspace).filter(Workspace.id.in_(workspace_ids)).all()
    return workspaces


@router.get("/available", response_model=list[WorkspaceOut])
def list_available_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all workspaces (for workspace selection on first login)."""
    return db.query(Workspace).all()


@router.post("/join/{workspace_id}", status_code=status.HTTP_201_CREATED)
def join_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Join a workspace as VIEWER."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    existing = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already a member")
    db.add(WorkspaceMember(
        workspace_id=workspace_id,
        user_id=current_user.id,
        role=RoleEnum.VIEWER,
    ))
    db.commit()
    return {"status": "ok"}


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(
    workspace_id: str,
    payload: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_workspace_role(db, current_user.id, workspace_id, RoleEnum.ADMIN)
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ws, field, value)
    db.commit()
    db.refresh(ws)
    return ws


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_workspace_role(db, current_user.id, workspace_id, RoleEnum.ADMIN)
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    db.delete(ws)
    db.commit()


@router.get("/{workspace_id}/globals")
def get_globals(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get workspace globals variables."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"globals": ws.globals or {}}


@router.put("/{workspace_id}/globals")
def update_globals(
    workspace_id: str,
    payload: GlobalsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update workspace globals variables."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws.globals = payload.globals
    db.commit()
    db.refresh(ws)
    return {"globals": ws.globals}


@router.get("/{workspace_id}/members", response_model=list[MemberOut])
def list_members(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if current user is member
    current_member = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
        .first()
    )
    if not current_member:
        raise HTTPException(status_code=404, detail="Not a member of this workspace")

    # Return ALL members of the workspace
    members = (
        db.query(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .filter(WorkspaceMember.workspace_id == workspace_id)
        .all()
    )
    return [
        MemberOut(
            id=member.id,
            user_id=member.user_id,
            role=member.role,
            username=user.username,
            email=user.email,
        )
        for member, user in members
    ]


@router.post("/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(
    workspace_id: str,
    payload: WorkspaceMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_workspace_role(db, current_user.id, workspace_id, RoleEnum.ADMIN)

    # Check if user exists
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already member
    existing = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == payload.user_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member")

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=payload.user_id,
        role=payload.role
    )
    db.add(member)
    db.commit()
    return {"status": "ok"}


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_workspace_role(db, current_user.id, workspace_id, RoleEnum.ADMIN)

    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    db.commit()
