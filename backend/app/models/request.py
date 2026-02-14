import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, DateTime, Text, Enum as SAEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HttpMethod(str, PyEnum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class AuthType(str, PyEnum):
    NONE = "none"
    BEARER = "bearer"
    API_KEY = "api_key"
    BASIC = "basic"
    OAUTH2 = "oauth2"


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    method: Mapped[HttpMethod] = mapped_column(SAEnum(HttpMethod), default=HttpMethod.GET)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    headers: Mapped[dict | None] = mapped_column(JSON, default=dict)
    body: Mapped[str | None] = mapped_column(Text)
    body_type: Mapped[str | None] = mapped_column(String(50), default="json")
    auth_type: Mapped[AuthType] = mapped_column(SAEnum(AuthType), default=AuthType.NONE)
    auth_config: Mapped[dict | None] = mapped_column(JSON, default=dict)
    query_params: Mapped[dict | None] = mapped_column(JSON, default=dict)
    pre_request_script: Mapped[str | None] = mapped_column(Text, default=None)
    post_response_script: Mapped[str | None] = mapped_column(Text, default=None)
    form_data: Mapped[list | None] = mapped_column(JSON, default=None)
    settings: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    collection_item: Mapped["CollectionItem | None"] = relationship(back_populates="request")  # noqa: F821
