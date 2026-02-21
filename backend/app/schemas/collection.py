from pydantic import BaseModel, Field

from app.models.collection import CollectionVisibility


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    visibility: CollectionVisibility = CollectionVisibility.PRIVATE
    workspace_id: str | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    pre_request_script: str | None = None
    post_response_script: str | None = None
    script_language: str | None = "python"


class CollectionOut(BaseModel):
    id: str
    name: str
    description: str | None
    visibility: CollectionVisibility
    owner_id: str
    workspace_id: str | None
    variables: dict[str, str] | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    sort_order: int | None = 0
    pre_request_script: str | None = None
    post_response_script: str | None = None
    script_language: str | None = "python"

    model_config = {"from_attributes": True}


class CollectionItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    is_folder: bool = False
    parent_id: str | None = None
    request_id: str | None = None
    sort_order: int = 0
    auth_type: str | None = None
    auth_config: dict | None = None
    description: str | None = None
    variables: dict | None = None
    pre_request_script: str | None = None
    post_response_script: str | None = None
    script_language: str | None = None


class CollectionItemOut(BaseModel):
    id: str
    name: str
    is_folder: bool
    parent_id: str | None
    request_id: str | None
    sort_order: int
    method: str | None = None
    protocol: str | None = None
    auth_type: str | None = None
    auth_config: dict | None = None
    description: str | None = None
    variables: dict | None = None
    pre_request_script: str | None = None
    post_response_script: str | None = None
    script_language: str | None = None

    model_config = {"from_attributes": True}
