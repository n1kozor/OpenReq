from pydantic import BaseModel, Field


class DnsResolveRequest(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=253)


class DnsRecord(BaseModel):
    ip: str
    family: str  # "IPv4" or "IPv6"


class DnsResolveResponse(BaseModel):
    hostname: str
    records: list[DnsRecord]
    elapsed_ms: float


class PingRequest(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=253)
    count: int = Field(default=4, ge=1, le=20)


class PingResult(BaseModel):
    seq: int
    time_ms: float | None = None
    timeout: bool = False


class PingResponse(BaseModel):
    hostname: str
    resolved_ip: str | None = None
    results: list[PingResult]
    min_ms: float | None = None
    avg_ms: float | None = None
    max_ms: float | None = None
    packet_loss_percent: float
    elapsed_ms: float
