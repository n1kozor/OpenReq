from typing import Any

from pydantic import BaseModel, Field

from app.models.request import HttpMethod, AuthType


class RequestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    method: HttpMethod = HttpMethod.GET
    url: str
    headers: dict[str, str] | None = None
    body: str | None = None
    body_type: str | None = "json"
    auth_type: AuthType = AuthType.NONE
    auth_config: dict | None = None
    query_params: dict[str, str] | None = None
    pre_request_script: str | None = None
    post_response_script: str | None = None
    form_data: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None
    protocol: str = "http"


class RequestUpdate(BaseModel):
    name: str | None = None
    method: HttpMethod | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    body: str | None = None
    body_type: str | None = None
    auth_type: AuthType | None = None
    auth_config: dict | None = None
    query_params: dict[str, str] | None = None
    pre_request_script: str | None = None
    post_response_script: str | None = None
    form_data: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None
    protocol: str | None = None


class RequestOut(BaseModel):
    id: str
    name: str
    method: HttpMethod
    url: str
    headers: dict | None
    body: str | None
    body_type: str | None
    auth_type: AuthType
    auth_config: dict | None
    query_params: dict | None
    pre_request_script: str | None
    post_response_script: str | None
    form_data: list | None = None
    settings: dict | None = None
    protocol: str = "http"

    model_config = {"from_attributes": True}
