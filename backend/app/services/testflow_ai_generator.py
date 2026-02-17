"""
AI-powered Test Flow Generator — analyzes a collection and generates a visual test flow.
Streams nodes/edges via SSE so the frontend can animate them appearing on the canvas.
"""
import json
import logging
import uuid
from typing import AsyncGenerator

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.models.collection import Collection, CollectionItem
from app.models.request import Request
from app.services.ai_generator import AIProviderConfig, OLLAMA_DEFAULT_NUM_CTX

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


SYSTEM_PROMPT = """\
You are a test flow architect. Given a collection of API requests, design an optimal test flow graph.

Return ONLY valid JSON (no markdown, no explanation) with this EXACT structure:
{
  "nodes": [ ... ],
  "edges": [ ... ]
}

## Node structure
Each node: {"id": "n1", "type": "<type>", "label": "<short label>", "config": {<type-specific>}}

## Available node types and their config:

### http_request — Execute an API request
config: {"request_id": "<id from the provided requests list>"}

### assertion — Check response (MUST follow an http_request node)
config: {"assertions": [{"type": "<type>", "operator": "<op>", "expected": "<val>", "field": ""}]}
  - type: "status_code" | "body_contains" | "json_path" | "header_check" | "response_time"
  - operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains" | "regex"

### script — Run a script
config: {"language": "python", "script": "<python code using req.* API>"}

### set_variable — Set flow variables
config: {"assignments": [{"key": "<name>", "value": "<value or {{var}}>"}]}

### delay — Wait
config: {"delay_ms": 1000}

### condition — Branch based on expression
config: {"expression": "<python expression>"}
  - Available in expression: vars, status_code, response_body, response_headers, elapsed_ms

### loop — Repeat
config: {"mode": "count", "count": 3, "max_iterations": 100}

## Edge structure
Each edge: {"source": "n1", "target": "n2"}
For branching nodes (condition, assertion, loop), use handles:
  - condition/assertion: source_handle "source-true" or "source-false"
  - loop: source_handle "source-loop" (body) or "source-done" (exit)

## Design rules
1. Start with authentication/setup requests first
2. After EVERY http_request, add an assertion node checking at least the status code
3. If a request likely returns a token/id, add a set_variable node to capture it with a script
4. Connect nodes sequentially with edges
5. Use conditions for error handling (e.g., check if auth succeeded before proceeding)
6. Group related operations: auth → read → write → delete
7. Use realistic assertion values (200 for GET, 201 for POST create, 204 for DELETE)
8. Node IDs must be unique strings like "n1", "n2", etc.
9. Every edge source/target must reference a valid node id
10. ONLY use request_ids from the provided list — NEVER invent request IDs

## Strategy-specific guidance
- "comprehensive": Test ALL requests with full assertions, variable passing, error conditions
- "smoke": Quick test — only the most important requests with basic status checks
- "auth_flow": Focus on authentication chain — login, use token, refresh, protected endpoints
- "crud": Follow Create → Read → Update → Delete pattern, pass IDs between steps
"""


def _collect_requests(db: Session, collection_id: str, request_ids: list[str] | None = None) -> list[dict]:
    """Collect all requests from a collection with their details.
    If request_ids is provided, only include those specific requests.
    """
    query = (
        db.query(CollectionItem)
        .filter(CollectionItem.collection_id == collection_id, CollectionItem.is_folder == False)  # noqa: E712
        .order_by(CollectionItem.sort_order)
    )
    if request_ids:
        query = query.filter(CollectionItem.request_id.in_(request_ids))
    items = query.all()

    requests = []
    for item in items:
        if not item.request_id:
            continue
        req = db.query(Request).filter(Request.id == item.request_id).first()
        if not req:
            continue

        req_data: dict = {
            "id": req.id,
            "name": req.name or item.name,
            "method": req.method.value if hasattr(req.method, "value") else str(req.method),
            "url": req.url,
            "protocol": req.protocol or "http",
        }

        if req.auth_type and str(req.auth_type) != "none":
            req_data["auth_type"] = req.auth_type.value if hasattr(req.auth_type, "value") else str(req.auth_type)

        if req.body and req.body_type and req.body_type != "none":
            req_data["body_type"] = req.body_type
            # Include body structure (keys only, no values for security)
            try:
                body_obj = json.loads(req.body)
                if isinstance(body_obj, dict):
                    req_data["body_keys"] = list(body_obj.keys())
            except (json.JSONDecodeError, TypeError):
                pass

        if req.headers:
            headers = req.headers if isinstance(req.headers, dict) else {}
            if headers:
                req_data["header_keys"] = [h.get("key", "") for h in headers if isinstance(h, dict) and h.get("enabled", True)]

        requests.append(req_data)

    return requests


def _build_user_message(requests: list[dict], strategy: str, extra_prompt: str | None) -> str:
    """Build the user message with the collection's requests."""
    lines = [f"Strategy: {strategy}", "", "Available requests:"]
    for r in requests:
        line = f"- ID: {r['id']} | {r['method']} {r['url']} | Name: {r['name']}"
        if r.get("protocol") != "http":
            line += f" | Protocol: {r['protocol']}"
        if r.get("auth_type"):
            line += f" | Auth: {r['auth_type']}"
        if r.get("body_type"):
            line += f" | Body: {r['body_type']}"
        if r.get("body_keys"):
            line += f" | Body keys: {', '.join(r['body_keys'])}"
        lines.append(line)

    if extra_prompt:
        lines.append(f"\nAdditional instructions: {extra_prompt}")

    lines.append(f"\nTotal requests: {len(requests)}")
    lines.append("Generate the test flow JSON now.")
    return "\n".join(lines)


def _compute_positions(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Compute simple vertical positions for nodes based on edge topology."""
    # Build adjacency
    children: dict[str, list[str]] = {}
    parents: dict[str, list[str]] = {}
    node_ids = {n["id"] for n in nodes}

    for e in edges:
        src = e.get("source", "")
        tgt = e.get("target", "")
        if src in node_ids and tgt in node_ids:
            children.setdefault(src, []).append(tgt)
            parents.setdefault(tgt, []).append(src)

    # Find roots (nodes with no parents)
    roots = [n["id"] for n in nodes if n["id"] not in parents]
    if not roots:
        roots = [nodes[0]["id"]] if nodes else []

    # BFS to assign levels
    levels: dict[str, int] = {}
    queue = [(r, 0) for r in roots]
    visited = set()

    while queue:
        nid, level = queue.pop(0)
        if nid in visited:
            levels[nid] = max(levels.get(nid, 0), level)
            continue
        visited.add(nid)
        levels[nid] = max(levels.get(nid, 0), level)
        for child in children.get(nid, []):
            queue.append((child, level + 1))

    # Assign positions
    level_counts: dict[int, int] = {}
    for n in nodes:
        level = levels.get(n["id"], 0)
        col = level_counts.get(level, 0)
        level_counts[level] = col + 1
        n["position_x"] = col * 280
        n["position_y"] = level * 160

    return nodes


async def generate_testflow_stream(
    db: Session,
    collection_id: str,
    strategy: str,
    extra_prompt: str | None,
    config: AIProviderConfig,
    request_ids: list[str] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream test flow generation via SSE."""

    # Phase 1: Collect requests
    yield _sse("progress", {"phase": "collecting"})

    collection = db.query(Collection).filter(Collection.id == collection_id).first()
    if not collection:
        yield _sse("error", {"message": "Collection not found"})
        return

    requests = _collect_requests(db, collection_id, request_ids)
    if not requests:
        yield _sse("error", {"message": "No requests found in collection"})
        return

    yield _sse("progress", {"phase": "collected", "count": len(requests)})

    # Phase 2: Call AI
    yield _sse("progress", {"phase": "generating"})

    try:
        if config.provider == "ollama":
            client = AsyncOpenAI(
                api_key="ollama",
                base_url=f"{(config.base_url or 'http://localhost:11434').rstrip('/')}/v1",
                timeout=300.0,
            )
        else:
            client = AsyncOpenAI(api_key=config.api_key, timeout=300.0)

        model = config.model or ("llama3.1" if config.provider == "ollama" else "gpt-4.1-mini")

        extra_kwargs: dict = {}
        if config.provider == "ollama":
            extra_kwargs["extra_body"] = {"options": {"num_ctx": OLLAMA_DEFAULT_NUM_CTX * 2}}

        user_msg = _build_user_message(requests, strategy, extra_prompt)

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=1,
            **extra_kwargs,
        )

        raw = response.choices[0].message.content or ""

        # Extract JSON from response (handle markdown code blocks)
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            raw = raw.strip()

        flow_data = json.loads(raw)

    except json.JSONDecodeError as e:
        logger.error("AI returned invalid JSON: %s", e)
        yield _sse("error", {"message": f"AI returned invalid JSON: {e}"})
        return
    except Exception as e:
        logger.error("AI generation failed: %s", e)
        yield _sse("error", {"message": str(e)})
        return

    ai_nodes = flow_data.get("nodes", [])
    ai_edges = flow_data.get("edges", [])

    if not ai_nodes:
        yield _sse("error", {"message": "AI generated no nodes"})
        return

    # Phase 3: Validate and fix node references
    valid_request_ids = {r["id"] for r in requests}
    for node in ai_nodes:
        cfg = node.get("config", {})
        if node.get("type") == "http_request" and cfg.get("request_id"):
            if cfg["request_id"] not in valid_request_ids:
                # Try to match by name
                req_name = node.get("label", "").lower()
                matched = next((r for r in requests if req_name in r["name"].lower()), None)
                if matched:
                    cfg["request_id"] = matched["id"]
                else:
                    cfg["request_id"] = requests[0]["id"]

    # Phase 4: Compute positions
    ai_nodes = _compute_positions(ai_nodes, ai_edges)

    # Phase 5: Stream nodes one by one
    yield _sse("progress", {"phase": "creating_nodes", "total": len(ai_nodes)})

    node_id_map: dict[str, str] = {}  # AI id -> real UUID
    for i, node in enumerate(ai_nodes):
        real_id = f"ai-{uuid.uuid4().hex[:8]}"
        node_id_map[node["id"]] = real_id

        node_data = {
            "id": real_id,
            "node_type": node.get("type", "http_request"),
            "label": node.get("label", f"Node {i+1}"),
            "position_x": node.get("position_x", i * 250),
            "position_y": node.get("position_y", 0),
            "config": node.get("config", {}),
        }

        yield _sse("node", {"index": i, "total": len(ai_nodes), "node": node_data})

    # Phase 6: Stream edges
    yield _sse("progress", {"phase": "creating_edges", "total": len(ai_edges)})

    for i, edge in enumerate(ai_edges):
        src = node_id_map.get(edge.get("source", ""))
        tgt = node_id_map.get(edge.get("target", ""))
        if not src or not tgt:
            continue

        edge_data = {
            "id": f"e-{uuid.uuid4().hex[:8]}",
            "source_node_id": src,
            "target_node_id": tgt,
            "source_handle": edge.get("source_handle"),
            "target_handle": edge.get("target_handle"),
            "label": edge.get("label"),
        }

        yield _sse("edge", {"index": i, "total": len(ai_edges), "edge": edge_data})

    # Done
    yield _sse("complete", {
        "node_count": len(ai_nodes),
        "edge_count": len(ai_edges),
    })
