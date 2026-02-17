import asyncio
import json
from typing import AsyncGenerator

from sqlalchemy.orm import Session

from app.models.collection import CollectionItem
from app.models.request import Request
from app.schemas.proxy import ProxyRequest, ProxyResponse, RequestSettings


def _collect_requests_recursive(
    db: Session,
    collection_id: str,
    parent_id: str | None,
) -> list[CollectionItem]:
    """Depth-first traversal: folders recursed, requests collected in sort_order."""
    items = db.query(CollectionItem).filter(
        CollectionItem.collection_id == collection_id,
        CollectionItem.parent_id == parent_id,
    ).order_by(CollectionItem.sort_order).all()

    result: list[CollectionItem] = []
    for item in items:
        if item.is_folder:
            result.extend(_collect_requests_recursive(db, collection_id, item.id))
        elif item.request_id:
            result.append(item)
    return result


async def run_collection_stream(
    db: Session,
    collection_id: str,
    folder_id: str | None,
    environment_id: str | None,
    iterations: int = 1,
    delay_ms: int = 0,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE events for each request result."""
    from app.schemas.proxy import FormDataItem
    from app.services.proxy import execute_proxy_request

    all_items = _collect_requests_recursive(db, collection_id, folder_id)
    total = len(all_items)

    for iteration in range(1, iterations + 1):
        # Send start event for this iteration
        yield f"data: {json.dumps({'type': 'start', 'total': total, 'iteration': iteration, 'totalIterations': iterations})}\n\n"

        accumulated_vars: dict[str, str] = {}

        for idx, item in enumerate(all_items):
            if delay_ms > 0 and idx > 0:
                await asyncio.sleep(delay_ms / 1000)

            req = db.query(Request).filter(Request.id == item.request_id).first()
            if not req:
                continue

            form_data = None
            if req.form_data:
                form_data = [FormDataItem(**fd) for fd in req.form_data]

            request_settings = None
            if req.settings:
                request_settings = RequestSettings(**req.settings)

            proxy_req = ProxyRequest(
                method=req.method,
                url=req.url,
                headers=req.headers or {},
                body=req.body,
                body_type=req.body_type,
                form_data=form_data,
                query_params=req.query_params or {},
                auth_type=req.auth_type,
                auth_config=req.auth_config or {},
                environment_id=environment_id,
                collection_id=collection_id,
                collection_item_id=item.id,
                pre_request_script=req.pre_request_script,
                post_response_script=req.post_response_script,
                request_settings=request_settings,
                request_name=req.name,
                iteration=iteration,
                iteration_count=iterations,
            )

            result_item: dict
            try:
                response = await execute_proxy_request(
                    db, proxy_req, extra_variables=dict(accumulated_vars),
                )
                if response.pre_request_result:
                    if response.pre_request_result.variables:
                        accumulated_vars.update(response.pre_request_result.variables)
                    if response.pre_request_result.globals:
                        accumulated_vars.update(response.pre_request_result.globals)
                if response.script_result:
                    if response.script_result.variables:
                        accumulated_vars.update(response.script_result.variables)
                    if response.script_result.globals:
                        accumulated_vars.update(response.script_result.globals)

                result_item = {
                    "type": "result",
                    "index": idx,
                    "iteration": iteration,
                    "item_id": item.id,
                    "request_name": req.name,
                    "method": req.method,
                    "status": "success",
                    "response": response.model_dump(),
                }
            except Exception as exc:
                result_item = {
                    "type": "result",
                    "index": idx,
                    "iteration": iteration,
                    "item_id": item.id,
                    "request_name": req.name,
                    "method": req.method,
                    "status": "error",
                    "error": str(exc),
                }

            yield f"data: {json.dumps(result_item)}\n\n"

        yield f"data: {json.dumps({'type': 'iteration_done', 'iteration': iteration})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"
