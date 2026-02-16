import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TestFlowNodeType(str, PyEnum):
    HTTP_REQUEST = "http_request"
    COLLECTION = "collection"
    ASSERTION = "assertion"
    SCRIPT = "script"
    DELAY = "delay"
    CONDITION = "condition"
    LOOP = "loop"
    SET_VARIABLE = "set_variable"
    GROUP = "group"


class TestFlow(Base):
    __tablename__ = "test_flows"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL")
    )

    # Canvas viewport state (persisted for reopening)
    viewport: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Flow-level variables (initial values)
    variables: Mapped[dict | None] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    owner: Mapped["User"] = relationship()  # noqa: F821
    workspace: Mapped["Workspace | None"] = relationship()  # noqa: F821
    nodes: Mapped[list["TestFlowNode"]] = relationship(
        back_populates="flow", cascade="all, delete-orphan"
    )
    edges: Mapped[list["TestFlowEdge"]] = relationship(
        back_populates="flow", cascade="all, delete-orphan"
    )
    runs: Mapped[list["TestFlowRun"]] = relationship(
        back_populates="flow", cascade="all, delete-orphan"
    )


class TestFlowNode(Base):
    __tablename__ = "test_flow_nodes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    flow_id: Mapped[str] = mapped_column(
        ForeignKey("test_flows.id", ondelete="CASCADE"), index=True
    )

    node_type: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    # Canvas position
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)

    # Node-type-specific configuration stored as JSON
    config: Mapped[dict | None] = mapped_column(JSON, default=dict)

    # Group parent (for visual grouping)
    parent_node_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    flow: Mapped["TestFlow"] = relationship(back_populates="nodes")


class TestFlowEdge(Base):
    __tablename__ = "test_flow_edges"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    flow_id: Mapped[str] = mapped_column(
        ForeignKey("test_flows.id", ondelete="CASCADE"), index=True
    )

    source_node_id: Mapped[str] = mapped_column(String(36), nullable=False)
    target_node_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source_handle: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_handle: Mapped[str | None] = mapped_column(String(50), nullable=True)

    label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    flow: Mapped["TestFlow"] = relationship(back_populates="edges")


class TestFlowRun(Base):
    __tablename__ = "test_flow_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    flow_id: Mapped[str] = mapped_column(
        ForeignKey("test_flows.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    environment_id: Mapped[str | None] = mapped_column(
        ForeignKey("environments.id", ondelete="SET NULL"), nullable=True
    )

    flow_name: Mapped[str] = mapped_column(String(255), nullable=False)
    environment_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="completed"
    )

    total_nodes: Mapped[int] = mapped_column(Integer, default=0)
    passed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    total_assertions: Mapped[int] = mapped_column(Integer, default=0)
    passed_assertions: Mapped[int] = mapped_column(Integer, default=0)
    failed_assertions: Mapped[int] = mapped_column(Integer, default=0)
    total_time_ms: Mapped[float] = mapped_column(Float, default=0.0)

    final_variables: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    flow: Mapped["TestFlow"] = relationship(back_populates="runs")
    results: Mapped[list["TestFlowRunResult"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="TestFlowRunResult.execution_order",
    )


class TestFlowRunResult(Base):
    __tablename__ = "test_flow_run_results"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("test_flow_runs.id", ondelete="CASCADE"), index=True
    )

    node_id: Mapped[str] = mapped_column(String(36), nullable=False)
    node_type: Mapped[str] = mapped_column(String(20), nullable=False)
    node_label: Mapped[str] = mapped_column(String(200), nullable=False)
    execution_order: Mapped[int] = mapped_column(Integer, nullable=False)
    iteration: Mapped[int] = mapped_column(Integer, default=1)

    status: Mapped[str] = mapped_column(String(10), nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    elapsed_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    assertion_results: Mapped[list | None] = mapped_column(JSON, nullable=True)
    console_logs: Mapped[list | None] = mapped_column(JSON, nullable=True)
    variables_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    branch_taken: Mapped[str | None] = mapped_column(String(20), nullable=True)

    run: Mapped["TestFlowRun"] = relationship(back_populates="results")
