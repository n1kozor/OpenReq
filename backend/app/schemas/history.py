from datetime import datetime

from pydantic import BaseModel


class HistoryOut(BaseModel):
    id: str
    method: str
    url: str
    status_code: int | None
    elapsed_ms: float | None
    size_bytes: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryDetailOut(HistoryOut):
    request_headers: dict | None
    request_body: str | None
    response_headers: dict | None
    response_body: str | None
    resolved_request: dict | None = None
