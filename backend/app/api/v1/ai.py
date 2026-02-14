import asyncio
import json as json_lib
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.collection import Collection, CollectionItem, CollectionVisibility
from app.models.request import Request, HttpMethod, AuthType
from app.models.user import User
from app.models.app_settings import get_or_create_settings
from app.services.ai_generator import (
    generate_collection_from_docs,
    fetch_api_docs_from_url,
    URL_RESEARCH_PROMPT,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class GenerateCollectionRequest(BaseModel):
    documentation: str | None = None
    collection_name: str | None = None
    collection_names: list[str] | None = None
    custom_instructions: str | None = None
    workspace_id: str | None = None
    source_url: str | None = None


class GeneratedEndpoint(BaseModel):
    name: str
    method: str
    url: str
    folder: str | None = None
    collection: str | None = None


class GeneratedCollectionSummary(BaseModel):
    id: str
    name: str
    total_requests: int


class GenerateCollectionResponse(BaseModel):
    collection_id: str | None = None
    collection_name: str | None = None
    collections: list[GeneratedCollectionSummary] | None = None
    endpoints: list[GeneratedEndpoint]
    total: int


class EndpointData(BaseModel):
    name: str
    method: str
    url: str
    folder: str | None = None
    collection: str | None = None
    headers: dict[str, str] | None = None
    query_params: dict[str, str] | None = None
    body: str | None = None
    body_type: str = "none"


class CreateFromEndpointsRequest(BaseModel):
    collection_name: str | None = None
    collection_names: list[str] | None = None
    use_folders: bool | None = None
    workspace_id: str | None = None
    source_url: str | None = None
    endpoints: list[EndpointData]


METHOD_MAP = {
    "GET": HttpMethod.GET,
    "POST": HttpMethod.POST,
    "PUT": HttpMethod.PUT,
    "PATCH": HttpMethod.PATCH,
    "DELETE": HttpMethod.DELETE,
    "HEAD": HttpMethod.HEAD,
    "OPTIONS": HttpMethod.OPTIONS,
}


def _clean_name(value: str | None, fallback: str) -> str:
    if value and value.strip():
        return value.strip()
    return fallback


def _resolve_collection_name(
    ep: EndpointData,
    payload: CreateFromEndpointsRequest,
) -> str:
    manual_names = [n.strip() for n in (payload.collection_names or []) if n and n.strip()]
    manual_first = manual_names[0] if manual_names else None

    if ep.collection and ep.collection.strip():
        name = ep.collection.strip()
        if manual_names and name not in manual_names:
            return manual_first or name
        return name

    if payload.collection_name and payload.collection_name.strip():
        return payload.collection_name.strip()

    if manual_first:
        return manual_first

    return "Generated Collection"


# ── SSE helpers ──────────────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json_lib.dumps(data)}\n\n"


# ── SSE Streaming Endpoint ──────────────────────────────────────────────────

@router.post("/generate-stream")
async def generate_stream(
    payload: GenerateCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Use global API key, fall back to environment variable
    app_settings = get_or_create_settings(db)
    api_key = (app_settings.openai_api_key if app_settings else None) or settings.OPENAI_API_KEY

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenAI API key not configured. Set it in Settings or environment variables.",
        )

    has_docs = payload.documentation and payload.documentation.strip()
    has_url = payload.source_url and payload.source_url.strip()

    if not has_docs and not has_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either documentation text or a source URL is required.",
        )

    return StreamingResponse(
        _stream_generation(
            api_key=api_key,
            documentation=payload.documentation,
            source_url=payload.source_url,
            has_url=bool(has_url),
            custom_instructions=payload.custom_instructions,
            collection_names=payload.collection_names,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_generation(
    api_key: str,
    documentation: str | None,
    source_url: str | None,
    has_url: bool,
    custom_instructions: str | None,
    collection_names: list[str] | None,
):
    """Async generator yielding SSE events during AI collection generation."""
    try:
        # ── Step 1: Research URL or analyze docs ──
        if has_url:
            yield _sse("step", {"phase": "research", "status": "active"})

            client = AsyncOpenAI(api_key=api_key, timeout=300.0)
            collected_text = ""
            buffer = ""

            try:
                stream = await client.responses.create(
                    model="gpt-5-mini",
                    input=URL_RESEARCH_PROMPT.format(url=source_url.strip()),
                    tools=[{"type": "web_search"}],
                    stream=True,
                )

                async for event in stream:
                    event_type = getattr(event, "type", "")

                    # Web search initiated
                    if event_type == "response.output_item.added":
                        item = getattr(event, "item", None)
                        if item and getattr(item, "type", "") == "web_search_call":
                            yield _sse("ai_output", {"text": "Searching the web...", "type": "search"})
                            await asyncio.sleep(0)

                    # Text output streaming
                    if event_type == "response.output_text.delta":
                        delta = getattr(event, "delta", "")
                        if delta:
                            collected_text += delta
                            buffer += delta
                            # Send snippet every ~200 chars or on markdown heading
                            if len(buffer) >= 200 or "\n## " in buffer or "\n### " in buffer:
                                # Extract headings for cleaner display
                                lines = buffer.strip().split("\n")
                                snippet = ""
                                for line in reversed(lines):
                                    if line.startswith("## ") or line.startswith("### "):
                                        snippet = line
                                        break
                                if not snippet:
                                    snippet = lines[-1] if lines else buffer[:200]
                                yield _sse("ai_output", {
                                    "text": snippet.strip()[:300],
                                    "type": "content",
                                    "chars": len(collected_text),
                                })
                                buffer = ""
                                await asyncio.sleep(0)

                # Flush remaining buffer
                if buffer.strip():
                    yield _sse("ai_output", {
                        "text": buffer.strip()[:300],
                        "type": "content",
                        "chars": len(collected_text),
                    })

            except Exception as e:
                yield _sse("error", {"message": f"Web research failed: {str(e)}"})
                return

            documentation = collected_text
            yield _sse("step", {
                "phase": "research",
                "status": "done",
                "chars": len(collected_text),
            })
        else:
            documentation = documentation or ""
            yield _sse("step", {"phase": "research", "status": "skipped"})

        # ── Step 2: Extract structured endpoints ──
        yield _sse("step", {"phase": "extract", "status": "active"})

        try:
            endpoints = await asyncio.to_thread(
                generate_collection_from_docs,
                api_key,
                documentation,
                custom_instructions,
                collection_names,
            )
        except Exception as e:
            yield _sse("error", {"message": f"Endpoint extraction failed: {str(e)}"})
            return

        if not endpoints:
            yield _sse("error", {"message": "No endpoints could be extracted."})
            return

        yield _sse("step", {
            "phase": "extract",
            "status": "done",
            "count": len(endpoints),
        })

        # ── Step 3: Send results ──
        yield _sse("endpoints", {
            "endpoints": endpoints,
            "total": len(endpoints),
        })

        yield _sse("done", {})

    except Exception as e:
        logger.error("Stream generation error: %s", e)
        yield _sse("error", {"message": str(e)})


# ── Create Collection from Selected Endpoints ───────────────────────────────

@router.post("/create-from-endpoints", response_model=GenerateCollectionResponse)
def create_from_endpoints(
    payload: CreateFromEndpointsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.endpoints:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No endpoints selected.",
        )

    use_folders = payload.use_folders if payload.use_folders is not None else True

    groups: dict[str, list[EndpointData]] = {}
    for ep in payload.endpoints:
        name = _resolve_collection_name(ep, payload)
        groups.setdefault(name, []).append(ep)

    collections_out: list[GeneratedCollectionSummary] = []
    first_collection_id: str | None = None
    first_collection_name: str | None = None

    for collection_name, group_endpoints in groups.items():
        description = (
            f"AI-generated from {payload.source_url.strip()} ({len(group_endpoints)} endpoints)"
            if payload.source_url and payload.source_url.strip()
            else f"AI-generated from API documentation ({len(group_endpoints)} endpoints)"
        )

        collection = Collection(
            name=_clean_name(collection_name, "Generated Collection"),
            description=description,
            visibility=CollectionVisibility.PRIVATE,
            owner_id=current_user.id,
            workspace_id=payload.workspace_id,
        )
        db.add(collection)
        db.flush()

        folder_map: dict[str, CollectionItem] = {}
        sort_order = 0

        for ep in group_endpoints:
            folder_name = ep.folder or "General"
            parent_id = None

            if use_folders:
                if folder_name not in folder_map:
                    folder_item = CollectionItem(
                        collection_id=collection.id,
                        name=folder_name,
                        is_folder=True,
                        sort_order=sort_order,
                    )
                    db.add(folder_item)
                    db.flush()
                    folder_map[folder_name] = folder_item
                    sort_order += 1
                parent_id = folder_map[folder_name].id

            method_str = ep.method.upper()
            method = METHOD_MAP.get(method_str, HttpMethod.GET)

            body_type = ep.body_type
            if ep.body and body_type == "none":
                body_type = "json"

            request = Request(
                name=ep.name,
                method=method,
                url=ep.url,
                headers=ep.headers or None,
                body=ep.body,
                body_type=body_type,
                auth_type=AuthType.NONE,
                query_params=ep.query_params or None,
            )
            db.add(request)
            db.flush()

            item = CollectionItem(
                collection_id=collection.id,
                name=request.name,
                is_folder=False,
                parent_id=parent_id,
                request_id=request.id,
                sort_order=sort_order,
            )
            db.add(item)
            sort_order += 1

        collections_out.append(
            GeneratedCollectionSummary(
                id=collection.id,
                name=collection.name,
                total_requests=len(group_endpoints),
            )
        )

        if first_collection_id is None:
            first_collection_id = collection.id
            first_collection_name = collection.name

    db.commit()

    return GenerateCollectionResponse(
        collection_id=first_collection_id,
        collection_name=first_collection_name,
        collections=collections_out,
        endpoints=[
            GeneratedEndpoint(
                name=ep.name,
                method=ep.method,
                url=ep.url,
                folder=ep.folder,
                collection=ep.collection,
            )
            for ep in payload.endpoints
        ],
        total=len(payload.endpoints),
    )


# ── Legacy: non-streaming generate (kept for backward compat) ───────────────

@router.post("/generate-collection", response_model=GenerateCollectionResponse)
def generate_collection(
    payload: GenerateCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Use global API key, fall back to environment variable
    app_settings = get_or_create_settings(db)
    api_key = (app_settings.openai_api_key if app_settings else None) or settings.OPENAI_API_KEY

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenAI API key not configured. Set it in Settings or environment variables.",
        )

    has_docs = payload.documentation and payload.documentation.strip()
    has_url = payload.source_url and payload.source_url.strip()

    if not has_docs and not has_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either documentation text or a source URL is required.",
        )

    documentation = payload.documentation or ""
    if has_url:
        try:
            documentation = fetch_api_docs_from_url(
                api_key=api_key,
                url=payload.source_url.strip(),
            )
        except Exception as e:
            logger.error("URL doc extraction failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to extract API documentation from URL: {str(e)}",
            )

    try:
        endpoints = generate_collection_from_docs(
            api_key=api_key,
            documentation=documentation,
            custom_instructions=payload.custom_instructions,
            collection_names=payload.collection_names,
        )
    except Exception as e:
        logger.error("AI generation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI generation failed: {str(e)}",
        )

    if not endpoints:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No endpoints could be extracted from the documentation.",
        )

    collection_name = (
        (payload.collection_name or "").strip()
        or (payload.collection_names[0].strip() if payload.collection_names else "")
    )
    if not collection_name:
        for ep in endpoints:
            if ep.get("collection"):
                collection_name = str(ep.get("collection")).strip()
                break
    if not collection_name:
        collection_name = "Generated Collection"

    collection = Collection(
        name=collection_name,
        description=(
            f"AI-generated from {payload.source_url.strip()} ({len(endpoints)} endpoints)"
            if has_url
            else f"AI-generated from API documentation ({len(endpoints)} endpoints)"
        ),
        visibility=CollectionVisibility.PRIVATE,
        owner_id=current_user.id,
        workspace_id=payload.workspace_id,
    )
    db.add(collection)
    db.flush()

    folder_map: dict[str, CollectionItem] = {}
    sort_order = 0

    for ep in endpoints:
        folder_name = ep.get("folder", "General")

        if folder_name not in folder_map:
            folder_item = CollectionItem(
                collection_id=collection.id,
                name=folder_name,
                is_folder=True,
                sort_order=sort_order,
            )
            db.add(folder_item)
            db.flush()
            folder_map[folder_name] = folder_item
            sort_order += 1

        method_str = ep.get("method", "GET").upper()
        method = METHOD_MAP.get(method_str, HttpMethod.GET)

        body = ep.get("body")
        body_type = ep.get("body_type", "none")
        if body and body_type == "none":
            body_type = "json"

        request = Request(
            name=ep.get("name", f"{method_str} {ep.get('url', '')}"),
            method=method,
            url=ep.get("url", ""),
            headers=ep.get("headers") or None,
            body=body,
            body_type=body_type,
            auth_type=AuthType.NONE,
            query_params=ep.get("query_params") or None,
        )
        db.add(request)
        db.flush()

        item = CollectionItem(
            collection_id=collection.id,
            name=request.name,
            is_folder=False,
            parent_id=folder_map[folder_name].id,
            request_id=request.id,
            sort_order=sort_order,
        )
        db.add(item)
        sort_order += 1

    db.commit()
    db.refresh(collection)

    return GenerateCollectionResponse(
        collection_id=collection.id,
        collection_name=collection.name,
        collections=None,
        endpoints=[
            GeneratedEndpoint(
                name=ep.get("name", ""),
                method=ep.get("method", "GET"),
                url=ep.get("url", ""),
                folder=ep.get("folder"),
                collection=ep.get("collection"),
            )
            for ep in endpoints
        ],
        total=len(endpoints),
    )
