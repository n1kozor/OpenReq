import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, DateTime, ForeignKey, Boolean, Integer, Enum as SAEnum, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CollectionVisibility(str, PyEnum):
    PRIVATE = "private"
    SHARED = "shared"


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    visibility: Mapped[CollectionVisibility] = mapped_column(
        SAEnum(CollectionVisibility), default=CollectionVisibility.PRIVATE
    )
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"))
    variables: Mapped[dict | None] = mapped_column(JSON, default=dict)
    default_headers: Mapped[dict | None] = mapped_column(JSON, default=None)
    default_query_params: Mapped[dict | None] = mapped_column(JSON, default=None)
    default_body: Mapped[str | None] = mapped_column(Text, default=None)
    default_body_type: Mapped[str | None] = mapped_column(String(50), default=None)
    auth_type: Mapped[str | None] = mapped_column(String(20), default=None)
    auth_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    pre_request_script: Mapped[str | None] = mapped_column(default=None)
    post_response_script: Mapped[str | None] = mapped_column(default=None)
    script_language: Mapped[str | None] = mapped_column(String(20), default="python")
    openapi_spec: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped["User"] = relationship(back_populates="collections")  # noqa: F821
    workspace: Mapped["Workspace | None"] = relationship(back_populates="collections")  # noqa: F821
    items: Mapped[list["CollectionItem"]] = relationship(back_populates="collection", cascade="all, delete-orphan")


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("collection_items.id", ondelete="CASCADE"))
    is_folder: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    request_id: Mapped[str | None] = mapped_column(ForeignKey("requests.id", ondelete="SET NULL"))
    auth_type: Mapped[str | None] = mapped_column(String(20), default=None)
    auth_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    description: Mapped[str | None] = mapped_column(default=None)
    variables: Mapped[dict | None] = mapped_column(JSON, default=None)
    default_headers: Mapped[dict | None] = mapped_column(JSON, default=None)
    default_query_params: Mapped[dict | None] = mapped_column(JSON, default=None)
    default_body: Mapped[str | None] = mapped_column(Text, default=None)
    default_body_type: Mapped[str | None] = mapped_column(String(50), default=None)
    pre_request_script: Mapped[str | None] = mapped_column(default=None)
    post_response_script: Mapped[str | None] = mapped_column(default=None)
    script_language: Mapped[str | None] = mapped_column(String(20), default=None)
    openapi_spec: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    collection: Mapped["Collection"] = relationship(back_populates="items")
    children: Mapped[list["CollectionItem"]] = relationship(back_populates="parent")
    parent: Mapped["CollectionItem | None"] = relationship(back_populates="children", remote_side=[id])
    request: Mapped["Request | None"] = relationship(back_populates="collection_item")  # noqa: F821
