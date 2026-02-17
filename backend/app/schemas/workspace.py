from pydantic import BaseModel, Field

from app.models.user import RoleEnum


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    description: str | None
    globals: dict[str, str] | None = None

    model_config = {"from_attributes": True}


class WorkspaceMemberAdd(BaseModel):
    user_id: str
    role: RoleEnum = RoleEnum.VIEWER
