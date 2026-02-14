import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Text, Integer, Float, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CollectionRun(Base):
    __tablename__ = "collection_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    environment_id: Mapped[str | None] = mapped_column(ForeignKey("environments.id", ondelete="SET NULL"), nullable=True)

    collection_name: Mapped[str] = mapped_column(String(255), nullable=False)
    environment_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    iterations: Mapped[int] = mapped_column(Integer, default=1)
    delay_ms: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")

    total_requests: Mapped[int] = mapped_column(Integer, default=0)
    passed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    total_tests: Mapped[int] = mapped_column(Integer, default=0)
    passed_tests: Mapped[int] = mapped_column(Integer, default=0)
    failed_tests: Mapped[int] = mapped_column(Integer, default=0)
    total_time_ms: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    results: Mapped[list["CollectionRunResult"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="CollectionRunResult.iteration, CollectionRunResult.sort_index",
    )


class CollectionRunResult(Base):
    __tablename__ = "collection_run_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(ForeignKey("collection_runs.id", ondelete="CASCADE"), index=True)

    iteration: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), nullable=False)
    request_name: Mapped[str] = mapped_column(String(255), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)

    status: Mapped[str] = mapped_column(String(10), nullable=False)  # success | error
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elapsed_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    response_headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    test_results: Mapped[list | None] = mapped_column(JSON, nullable=True)
    console_logs: Mapped[list | None] = mapped_column(JSON, nullable=True)

    run: Mapped["CollectionRun"] = relationship(back_populates="results")
