from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


# ── Node / Edge schemas ──


class TestFlowNodeCreate(BaseModel):
    id: str
    node_type: str
    label: str = ""
    position_x: float = 0.0
    position_y: float = 0.0
    config: dict[str, Any] | None = None
    parent_node_id: str | None = None


class TestFlowNodeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    node_type: str
    label: str
    position_x: float
    position_y: float
    config: dict[str, Any] | None = None
    parent_node_id: str | None = None


class TestFlowEdgeCreate(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    source_handle: str | None = None
    target_handle: str | None = None
    label: str | None = None


class TestFlowEdgeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    source_node_id: str
    target_node_id: str
    source_handle: str | None = None
    target_handle: str | None = None
    label: str | None = None


# ── Flow CRUD ──


class TestFlowCreate(BaseModel):
    name: str
    description: str | None = None
    workspace_id: str | None = None
    variables: dict[str, str] | None = None
    nodes: list[TestFlowNodeCreate] = []
    edges: list[TestFlowEdgeCreate] = []


class TestFlowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    viewport: dict[str, float] | None = None
    variables: dict[str, str] | None = None
    nodes: list[TestFlowNodeCreate] | None = None
    edges: list[TestFlowEdgeCreate] | None = None


class TestFlowSummaryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    description: str | None = None
    workspace_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TestFlowDetailOut(TestFlowSummaryOut):
    viewport: dict[str, float] | None = None
    variables: dict[str, str] | None = None
    nodes: list[TestFlowNodeOut] = []
    edges: list[TestFlowEdgeOut] = []


# ── Run schemas ──


class TestFlowRunResultCreate(BaseModel):
    node_id: str
    node_type: str
    node_label: str
    execution_order: int
    iteration: int = 1
    status: str
    error: str | None = None
    elapsed_ms: float | None = None
    status_code: int | None = None
    response_body: str | None = None
    response_headers: dict[str, str] | None = None
    size_bytes: int | None = None
    assertion_results: list[dict[str, Any]] | None = None
    console_logs: list[str] | None = None
    variables_snapshot: dict[str, str] | None = None
    branch_taken: str | None = None


class TestFlowRunCreate(BaseModel):
    flow_id: str
    flow_name: str
    environment_id: str | None = None
    environment_name: str | None = None
    status: str = "completed"
    total_nodes: int = 0
    passed_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    total_assertions: int = 0
    passed_assertions: int = 0
    failed_assertions: int = 0
    total_time_ms: float = 0.0
    final_variables: dict[str, str] | None = None
    results: list[TestFlowRunResultCreate] = []


class TestFlowRunResultOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    node_id: str
    node_type: str
    node_label: str
    execution_order: int
    iteration: int
    status: str
    error: str | None = None
    elapsed_ms: float | None = None
    status_code: int | None = None
    response_body: str | None = None
    response_headers: dict[str, str] | None = None
    size_bytes: int | None = None
    assertion_results: list[dict[str, Any]] | None = None
    console_logs: list[str] | None = None
    variables_snapshot: dict[str, str] | None = None
    branch_taken: str | None = None


class TestFlowRunSummaryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    flow_id: str
    flow_name: str
    environment_name: str | None = None
    status: str
    total_nodes: int
    passed_count: int
    failed_count: int
    skipped_count: int
    total_assertions: int
    passed_assertions: int
    failed_assertions: int
    total_time_ms: float
    created_at: datetime
    finished_at: datetime | None = None


class TestFlowRunDetailOut(TestFlowRunSummaryOut):
    final_variables: dict[str, str] | None = None
    results: list[TestFlowRunResultOut] = []
