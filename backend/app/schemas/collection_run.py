from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class CollectionRunResultCreate(BaseModel):
    iteration: int
    sort_index: int
    item_id: str
    request_name: str
    method: str
    status: str
    error: str | None = None
    status_code: int | None = None
    elapsed_ms: float | None = None
    size_bytes: int | None = None
    response_headers: dict[str, str] | None = None
    response_body: str | None = None
    test_results: list[dict[str, Any]] | None = None
    console_logs: list[str] | None = None


class CollectionRunCreate(BaseModel):
    collection_id: str
    collection_name: str
    environment_id: str | None = None
    environment_name: str | None = None
    iterations: int = 1
    delay_ms: int = 0
    status: str = "completed"
    total_requests: int = 0
    passed_count: int = 0
    failed_count: int = 0
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0
    total_time_ms: float = 0.0
    results: list[CollectionRunResultCreate] = []


class CollectionRunResultOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    iteration: int
    sort_index: int
    item_id: str
    request_name: str
    method: str
    status: str
    error: str | None = None
    status_code: int | None = None
    elapsed_ms: float | None = None
    size_bytes: int | None = None
    response_headers: dict[str, str] | None = None
    response_body: str | None = None
    test_results: list[dict[str, Any]] | None = None
    console_logs: list[str] | None = None


class CollectionRunSummaryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    collection_id: str
    collection_name: str
    environment_name: str | None = None
    iterations: int
    delay_ms: int
    status: str
    total_requests: int
    passed_count: int
    failed_count: int
    total_tests: int
    passed_tests: int
    failed_tests: int
    total_time_ms: float
    created_at: datetime
    finished_at: datetime | None = None


class CollectionRunDetailOut(CollectionRunSummaryOut):
    results: list[CollectionRunResultOut] = []
