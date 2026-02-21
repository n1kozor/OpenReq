import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.api.deps import get_current_user
from app.database import get_db
from app.models.history import RequestHistory
from app.models.user import User
from app.schemas.proxy import LocalProxyResponse, PreparedRequest, ProxyRequest, ProxyResponse
from app.services.collection_runner import run_collection_stream
from app.services.proxy import execute_proxy_request, prepare_proxy_request, complete_proxy_request

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/send", response_model=ProxyResponse)
async def send_request(
    payload: ProxyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "Proxy request | user=%s method=%s url=%s",
        current_user.id,
        payload.method.value,
        payload.url,
    )
    try:
        response = await execute_proxy_request(db, payload)
    except Exception as exc:
        logger.exception("Proxy request failed")
        # Save failed request to history
        db.add(RequestHistory(
            user_id=current_user.id,
            method=payload.method.value,
            url=payload.url,
            request_headers=payload.headers,
            request_body=payload.body,
        ))
        db.commit()
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {exc}")

    # Save to history (skip binary body to avoid bloating history)
    resolved = response.resolved_request or {
        "method": payload.method.value,
        "url": payload.url,
        "headers": payload.headers or {},
        "query_params": payload.query_params or {},
        "body": payload.body,
        "body_type": payload.body_type,
        "form_data": payload.form_data,
    }
    db.add(RequestHistory(
        user_id=current_user.id,
        method=resolved.get("method", payload.method.value),
        url=resolved.get("url", payload.url),
        request_headers=resolved.get("headers") or payload.headers,
        request_body=resolved.get("body", payload.body),
        resolved_request=resolved,
        status_code=response.status_code,
        response_headers=response.headers,
        response_body=response.body[:50000] if response.body and not response.is_binary else None,
        elapsed_ms=response.elapsed_ms,
        size_bytes=response.size_bytes,
    ))
    db.commit()

    logger.info(
        "Proxy response | status=%d elapsed=%.2fms size=%d binary=%s",
        response.status_code,
        response.elapsed_ms,
        response.size_bytes,
        response.is_binary,
    )
    return response


@router.post("/prepare", response_model=PreparedRequest)
async def prepare_request(
    payload: ProxyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve variables, run pre-scripts, apply auth. Returns fully resolved request
    for local execution by browser extension or desktop app."""
    logger.info(
        "Proxy prepare | user=%s method=%s url=%s",
        current_user.id, payload.method.value, payload.url,
    )
    try:
        return await prepare_proxy_request(db, payload)
    except Exception as exc:
        logger.exception("Proxy prepare failed")
        raise HTTPException(status_code=500, detail=f"Prepare failed: {exc}")


@router.post("/complete", response_model=ProxyResponse)
async def complete_request(
    payload: LocalProxyResponse,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run post-response scripts, save history, persist pm.* changes.
    Called after the client has executed the request locally."""
    logger.info(
        "Proxy complete | user=%s status=%d elapsed=%.2fms",
        current_user.id, payload.status_code, payload.elapsed_ms,
    )
    try:
        return await complete_proxy_request(db, payload, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Proxy complete failed")
        raise HTTPException(status_code=500, detail=f"Complete failed: {exc}")


@router.post("/run/{collection_id}")
async def run_collection(
    collection_id: str,
    folder_id: str | None = None,
    environment_id: str | None = None,
    iterations: int = Query(default=1, ge=1, le=100),
    delay_ms: int = Query(default=0, ge=0, le=60000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event_generator = run_collection_stream(
        db, collection_id, folder_id, environment_id,
        iterations=iterations, delay_ms=delay_ms,
    )
    return StreamingResponse(
        event_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
