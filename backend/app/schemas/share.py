from datetime import datetime

from pydantic import BaseModel, Field


class ShareCreate(BaseModel):
    collection_id: str
    folder_id: str | None = None
    title: str | None = Field(None, max_length=300)
    description_override: str | None = None
    password: str | None = None
    expires_at: datetime | None = None


class ShareUpdate(BaseModel):
    title: str | None = None
    description_override: str | None = None
    password: str | None = None
    remove_password: bool = False
    is_active: bool | None = None
    expires_at: datetime | None = None


class ShareOut(BaseModel):
    id: str
    token: str
    collection_id: str
    folder_id: str | None
    title: str | None
    description_override: str | None
    has_password: bool
    is_active: bool
    view_count: int
    expires_at: datetime | None
    created_at: datetime
    share_url: str

    model_config = {"from_attributes": True}


class SharePublicMeta(BaseModel):
    title: str
    description: str | None
    has_password: bool
    endpoint_count: int
    collection_name: str


class ShareDocsData(BaseModel):
    title: str
    description: str | None
    endpoint_count: int
    endpoints: list[dict]
    folder_tree: list[dict]
    generated_at: str


class SharePasswordVerify(BaseModel):
    password: str


class ShareSessionToken(BaseModel):
    session_token: str
    expires_in: int
