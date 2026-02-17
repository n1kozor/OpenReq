"""Test Flow execution engine — DAG-based, SSE streaming."""

import asyncio
import json
import re
import time
import traceback
from collections import defaultdict, deque
from typing import Any, AsyncGenerator

from sqlalchemy.orm import Session

from app.models.collection import CollectionItem
from app.models.request import Request
from app.models.test_flow import TestFlow, TestFlowEdge, TestFlowNode
from app.schemas.proxy import FormDataItem, ProxyRequest, RequestSettings


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


# ---------------------------------------------------------------------------
# Topological sort (Kahn's algorithm)
# ---------------------------------------------------------------------------

def _topological_sort(
    nodes: dict[str, TestFlowNode],
    outgoing: dict[str, list[TestFlowEdge]],
    incoming: dict[str, list[TestFlowEdge]],
) -> list[str]:
    """Return node IDs in topological (execution) order.

    Raises ValueError if a cycle is detected.
    """
    non_group = {nid for nid, n in nodes.items() if n.node_type != "group"}

    in_degree: dict[str, int] = {nid: 0 for nid in nodes}
    for nid in nodes:
        in_degree[nid] = len(incoming.get(nid, []))

    queue: deque[str] = deque()
    for nid, deg in in_degree.items():
        if deg == 0 and nid in non_group:
            queue.append(nid)

    order: list[str] = []
    while queue:
        nid = queue.popleft()
        order.append(nid)
        for edge in outgoing.get(nid, []):
            target = edge.target_node_id
            if target in in_degree:
                in_degree[target] -= 1
                if in_degree[target] == 0:
                    queue.append(target)

    # Cycle detection: if not all non-group nodes were visited, there's a cycle
    visited = set(order)
    unvisited = non_group - visited
    if unvisited:
        cycle_labels = [nodes[nid].label or nid for nid in unvisited]
        raise ValueError(
            f"Cycle detected in test flow involving nodes: {', '.join(cycle_labels)}"
        )

    return order


# ---------------------------------------------------------------------------
# Helper: find the closest upstream HTTP result for assertion nodes
# ---------------------------------------------------------------------------

def _find_upstream_http_result(
    node_id: str,
    incoming: dict[str, list[TestFlowEdge]],
    nodes: dict[str, TestFlowNode],
    node_results: dict[str, dict],
) -> dict | None:
    """BFS backwards to find the closest http_request or collection node result."""
    visited: set[str] = set()
    queue: deque[str] = deque()
    for edge in incoming.get(node_id, []):
        queue.append(edge.source_node_id)

    while queue:
        src = queue.popleft()
        if src in visited:
            continue
        visited.add(src)
        if src in node_results and nodes.get(src, None):
            nt = nodes[src].node_type
            if nt in ("http_request", "collection"):
                return node_results[src]
        for edge in incoming.get(src, []):
            queue.append(edge.source_node_id)
    return None


# ---------------------------------------------------------------------------
# Mark inactive branch downstream of a condition node
# ---------------------------------------------------------------------------

def _mark_inactive_branch(
    condition_node_id: str,
    branch_taken: str,
    outgoing: dict[str, list[TestFlowEdge]],
    nodes: dict[str, TestFlowNode],
    skipped: set[str],
):
    """Mark all nodes reachable only via the NOT-taken branch as skipped."""
    inactive_handle = "source-false" if branch_taken == "true" else "source-true"

    inactive_starts: list[str] = []
    active_starts: list[str] = []
    for edge in outgoing.get(condition_node_id, []):
        if edge.source_handle == inactive_handle:
            inactive_starts.append(edge.target_node_id)
        else:
            active_starts.append(edge.target_node_id)

    # BFS to collect all nodes reachable from inactive branch
    inactive_reachable: set[str] = set()
    queue: deque[str] = deque(inactive_starts)
    while queue:
        nid = queue.popleft()
        if nid in inactive_reachable:
            continue
        inactive_reachable.add(nid)
        for edge in outgoing.get(nid, []):
            queue.append(edge.target_node_id)

    # BFS to collect all nodes reachable from active branch
    active_reachable: set[str] = set()
    queue = deque(active_starts)
    while queue:
        nid = queue.popleft()
        if nid in active_reachable:
            continue
        active_reachable.add(nid)
        for edge in outgoing.get(nid, []):
            queue.append(edge.target_node_id)

    # Only skip nodes that are ONLY reachable via the inactive branch
    for nid in inactive_reachable - active_reachable:
        skipped.add(nid)


# ---------------------------------------------------------------------------
# Node executors
# ---------------------------------------------------------------------------

async def _exec_http_request(
    db: Session,
    config: dict,
    flow_vars: dict[str, str],
    environment_id: str | None,
    collection_id: str | None,
) -> dict:
    from app.services.proxy import execute_proxy_request

    request_id = config.get("request_id")
    if request_id:
        req = db.query(Request).filter(Request.id == request_id).first()
        if not req:
            return {"status": "error", "error": f"Request {request_id} not found"}

        form_data = None
        if req.form_data:
            form_data = [FormDataItem(**fd) for fd in req.form_data]
        request_settings = None
        if req.settings:
            request_settings = RequestSettings(**req.settings)

        # Look up CollectionItem for auth inheritance
        ci = db.query(CollectionItem).filter(CollectionItem.request_id == request_id).first()

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
            collection_item_id=ci.id if ci else None,
            pre_request_script=req.pre_request_script,
            post_response_script=req.post_response_script,
            request_settings=request_settings,
        )
    else:
        inline = config.get("inline_request", {})
        proxy_req = ProxyRequest(
            method=inline.get("method", "GET"),
            url=inline.get("url", ""),
            headers=inline.get("headers", {}),
            body=inline.get("body"),
            body_type=inline.get("body_type", "json"),
            query_params=inline.get("query_params", {}),
            auth_type=inline.get("auth_type", "none"),
            auth_config=inline.get("auth_config", {}),
            environment_id=environment_id,
        )

    response = await execute_proxy_request(
        db, proxy_req, extra_variables=dict(flow_vars)
    )

    variables: dict[str, str] = {}
    if response.pre_request_result and response.pre_request_result.variables:
        variables.update(response.pre_request_result.variables)
    if response.script_result and response.script_result.variables:
        variables.update(response.script_result.variables)

    test_results = None
    if response.script_result and response.script_result.test_results:
        test_results = response.script_result.test_results

    console_logs = []
    if response.pre_request_result and response.pre_request_result.logs:
        console_logs.extend(response.pre_request_result.logs)
    if response.script_result and response.script_result.logs:
        console_logs.extend(response.script_result.logs)

    body = response.body
    if body and len(body) > 50_000:
        body = body[:50_000]

    return {
        "status": "success",
        "node_type": "http_request",
        "status_code": response.status_code,
        "response_body": body,
        "response_headers": response.headers,
        "size_bytes": response.size_bytes,
        "variables": variables,
        "test_results": test_results,
        "console_logs": console_logs or None,
    }


async def _exec_collection(
    db: Session,
    config: dict,
    flow_vars: dict[str, str],
    environment_id: str | None,
) -> dict:
    from app.services.proxy import execute_proxy_request

    coll_id = config.get("collection_id")
    if not coll_id:
        return {"status": "error", "error": "No collection_id specified"}

    items = _collect_requests(db, coll_id, None)
    if not items:
        return {"status": "success", "node_type": "collection", "variables": {}}

    accumulated: dict[str, str] = dict(flow_vars)
    results: list[dict] = []
    total_ms = 0.0

    for item in items:
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
            collection_id=coll_id,
            collection_item_id=item.id,
            pre_request_script=req.pre_request_script,
            post_response_script=req.post_response_script,
            request_settings=request_settings,
        )

        try:
            response = await execute_proxy_request(
                db, proxy_req, extra_variables=dict(accumulated)
            )
            if response.pre_request_result and response.pre_request_result.variables:
                accumulated.update(response.pre_request_result.variables)
            if response.script_result and response.script_result.variables:
                accumulated.update(response.script_result.variables)
            total_ms += response.elapsed_ms
            results.append({
                "name": req.name,
                "method": req.method,
                "status_code": response.status_code,
                "elapsed_ms": response.elapsed_ms,
            })
        except Exception as exc:
            results.append({
                "name": req.name,
                "method": req.method,
                "error": str(exc),
            })

    return {
        "status": "success",
        "node_type": "collection",
        "status_code": results[-1].get("status_code") if results else None,
        "response_body": json.dumps(results),
        "variables": {k: v for k, v in accumulated.items() if k not in flow_vars or flow_vars[k] != v},
    }


def _collect_requests(
    db: Session, collection_id: str, parent_id: str | None
) -> list[CollectionItem]:
    items = (
        db.query(CollectionItem)
        .filter(
            CollectionItem.collection_id == collection_id,
            CollectionItem.parent_id == parent_id,
        )
        .order_by(CollectionItem.sort_order)
        .all()
    )
    result: list[CollectionItem] = []
    for item in items:
        if item.is_folder:
            result.extend(_collect_requests(db, collection_id, item.id))
        elif item.request_id:
            result.append(item)
    return result


def _exec_assertion(
    config: dict,
    node_results: dict[str, dict],
    incoming: dict[str, list[TestFlowEdge]],
    node_id: str,
    nodes: dict[str, TestFlowNode],
) -> dict:
    assertions = config.get("assertions", [])
    if not assertions:
        return {"status": "success", "node_type": "assertion", "assertion_results": []}

    # Find the upstream HTTP result
    upstream = _find_upstream_http_result(node_id, incoming, nodes, node_results)
    if not upstream:
        return {
            "status": "error",
            "error": "No upstream HTTP request found for assertion",
            "assertion_results": [],
            "branch_taken": "false",
        }

    # If upstream request failed, all assertions auto-fail
    if upstream.get("status") == "error":
        error_msg = upstream.get("error", "Upstream request failed")
        results = [
            {
                "name": a.get("type", "status_code") + ": " + (a.get("field") or a.get("expected", "")),
                "passed": False,
                "error": f"Upstream request failed: {error_msg}",
            }
            for a in assertions
        ]
        return {
            "status": "error",
            "node_type": "assertion",
            "assertion_results": results,
            "branch_taken": "false",
        }

    results: list[dict[str, Any]] = []
    all_passed = True

    for assertion in assertions:
        a_type = assertion.get("type", "status_code")
        operator = assertion.get("operator", "eq")
        expected = assertion.get("expected", "")
        field = assertion.get("field", "")

        try:
            actual: Any = None
            if a_type == "status_code":
                actual = upstream.get("status_code")
                passed = _compare(actual, expected, operator)
            elif a_type == "body_contains":
                body = upstream.get("response_body", "") or ""
                actual = body
                if operator == "contains":
                    passed = expected in body
                elif operator == "not_contains":
                    passed = expected not in body
                elif operator == "regex":
                    passed = bool(re.search(expected, body))
                else:
                    passed = _compare(body, expected, operator)
            elif a_type == "json_path":
                body = upstream.get("response_body", "") or ""
                try:
                    data = json.loads(body)
                    actual = _resolve_json_path(data, field)
                except (json.JSONDecodeError, Exception):
                    actual = None
                passed = _compare(actual, expected, operator)
            elif a_type == "header_check":
                headers = upstream.get("response_headers", {}) or {}
                actual = headers.get(field, headers.get(field.lower()))
                passed = _compare(actual, expected, operator)
            elif a_type == "response_time":
                actual = upstream.get("elapsed_ms")
                passed = _compare(actual, expected, operator)
            else:
                passed = False
                actual = None

            results.append({
                "name": f"{a_type}: {field or expected}",
                "passed": passed,
                "actual": str(actual) if actual is not None else None,
                "expected": expected,
                "error": None if passed else f"Expected {operator} {expected}, got {actual}",
            })
            if not passed:
                all_passed = False
        except Exception as exc:
            results.append({
                "name": f"{a_type}: {field or expected}",
                "passed": False,
                "error": str(exc),
            })
            all_passed = False

    return {
        "status": "success" if all_passed else "error",
        "node_type": "assertion",
        "assertion_results": results,
        "branch_taken": "true" if all_passed else "false",
    }


def _compare(actual: Any, expected: str, operator: str) -> bool:
    """Compare actual value against expected using operator."""
    try:
        if actual is None:
            return operator == "eq" and expected == ""

        # Try numeric comparison
        try:
            a_num = float(actual)
            e_num = float(expected)
            if operator == "eq":
                return a_num == e_num
            if operator == "neq":
                return a_num != e_num
            if operator == "gt":
                return a_num > e_num
            if operator == "lt":
                return a_num < e_num
            if operator == "gte":
                return a_num >= e_num
            if operator == "lte":
                return a_num <= e_num
        except (ValueError, TypeError):
            pass

        # String comparison
        a_str = str(actual)
        if operator == "eq":
            return a_str == expected
        if operator == "neq":
            return a_str != expected
        if operator == "contains":
            return expected in a_str
        if operator == "not_contains":
            return expected not in a_str
        if operator == "regex":
            return bool(re.search(expected, a_str))

        return False
    except Exception:
        return False


def _resolve_json_path(data: Any, path: str) -> Any:
    """Simple JSON path resolution: $.field.nested[0].value"""
    path = path.strip()
    if path.startswith("$."):
        path = path[2:]
    elif path.startswith("$"):
        path = path[1:]

    current = data
    for part in re.split(r'\.|\[(\d+)\]', path):
        if not part:
            continue
        if part.isdigit():
            current = current[int(part)]
        else:
            current = current[part]
    return current


async def _exec_script(
    config: dict,
    flow_vars: dict[str, str],
    node_results: dict[str, dict],
) -> dict:
    from app.services.proxy import _run_pre_script

    script = config.get("script", "")
    if not script.strip():
        return {"status": "success", "node_type": "script", "variables": {}}

    language = config.get("language", "python")

    raw = await asyncio.to_thread(
        _run_pre_script,
        script,
        language,
        dict(flow_vars),
        url="",
        method="GET",
        headers={},
        body=None,
        query_params={},
    )

    from app.schemas.proxy import ScriptResultSchema
    result = ScriptResultSchema(**raw)

    return {
        "status": "success",
        "node_type": "script",
        "variables": result.variables,
        "console_logs": result.logs or None,
    }


async def _exec_websocket(
    config: dict,
    flow_vars: dict[str, str],
    environment_id: str | None,
) -> dict:
    """Execute a WebSocket node: connect, send message, optionally wait for response."""
    import websockets

    ws_url = config.get("ws_url", "")
    ws_message = config.get("ws_message", "")
    ws_timeout_ms = config.get("ws_timeout_ms", 5000)
    ws_wait_response = config.get("ws_wait_response", True)
    ws_headers = config.get("headers", {})

    # Variable substitution
    for key, val in flow_vars.items():
        placeholder = "{{" + key + "}}"
        ws_url = ws_url.replace(placeholder, val)
        ws_message = ws_message.replace(placeholder, val)
        ws_headers = {k: v.replace(placeholder, val) for k, v in ws_headers.items()}

    if not ws_url:
        return {"status": "error", "error": "No WebSocket URL specified"}

    start = time.perf_counter()
    try:
        async with websockets.connect(
            ws_url,
            additional_headers=ws_headers if ws_headers else None,
            open_timeout=ws_timeout_ms / 1000,
        ) as ws:
            response_body = ""
            if ws_message:
                await ws.send(ws_message)
                if ws_wait_response:
                    try:
                        response_body = await asyncio.wait_for(
                            ws.recv(), timeout=ws_timeout_ms / 1000
                        )
                    except asyncio.TimeoutError:
                        response_body = "(timeout waiting for response)"
            elif ws_wait_response:
                try:
                    response_body = await asyncio.wait_for(
                        ws.recv(), timeout=ws_timeout_ms / 1000
                    )
                except asyncio.TimeoutError:
                    response_body = "(timeout waiting for response)"

        elapsed = (time.perf_counter() - start) * 1000
        return {
            "status": "success",
            "node_type": "websocket",
            "status_code": 101,
            "response_body": str(response_body),
            "elapsed_ms": round(elapsed, 2),
        }
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000
        return {
            "status": "error",
            "node_type": "websocket",
            "error": str(exc),
            "elapsed_ms": round(elapsed, 2),
        }


async def _exec_graphql(
    db: Session,
    config: dict,
    flow_vars: dict[str, str],
    environment_id: str | None,
    collection_id: str | None,
) -> dict:
    """Execute a GraphQL node: POST query+variables to endpoint, reuse HTTP executor."""
    gql_url = config.get("graphql_url", "")
    gql_query = config.get("graphql_query", "")
    gql_variables = config.get("graphql_variables", "{}")

    # Variable substitution
    for key, val in flow_vars.items():
        placeholder = "{{" + key + "}}"
        gql_url = gql_url.replace(placeholder, val)
        gql_query = gql_query.replace(placeholder, val)
        gql_variables = gql_variables.replace(placeholder, val)

    if not gql_url:
        return {"status": "error", "error": "No GraphQL URL specified"}

    # Build inline HTTP request config
    try:
        vars_parsed = json.loads(gql_variables) if gql_variables.strip() else {}
    except json.JSONDecodeError:
        vars_parsed = {}

    body = json.dumps({"query": gql_query, "variables": vars_parsed})
    headers = dict(config.get("headers", {}))
    headers.setdefault("Content-Type", "application/json")

    inline_config = {
        "inline_request": {
            "method": "POST",
            "url": gql_url,
            "headers": headers,
            "body": body,
            "body_type": "json",
        }
    }

    result = await _exec_http_request(
        db, inline_config, flow_vars, environment_id, collection_id
    )
    result["node_type"] = "graphql"
    return result


async def _exec_delay(config: dict) -> dict:
    delay_ms = config.get("delay_ms", 1000)
    await asyncio.sleep(delay_ms / 1000)
    return {"status": "success", "node_type": "delay"}


def _exec_condition(
    config: dict,
    flow_vars: dict[str, str],
    node_results: dict[str, dict],
    incoming: dict[str, list[TestFlowEdge]],
    node_id: str,
    nodes: dict[str, TestFlowNode],
    iteration: int = 0,
) -> dict:
    expression = config.get("expression", "false").strip()

    # Expression evaluation against flow variables and upstream HTTP results
    upstream = _find_upstream_http_result(node_id, incoming, nodes, node_results)
    eval_context = {
        "vars": dict(flow_vars),
        "status_code": upstream.get("status_code") if upstream else None,
        "response_body": upstream.get("response_body", "") if upstream else "",
        "response_headers": upstream.get("response_headers", {}) if upstream else {},
        "elapsed_ms": upstream.get("elapsed_ms") if upstream else None,
        "iteration": iteration,
    }

    try:
        # Support expressions like:
        # "status_code == 200", "vars.get('token') is not None",
        # "elapsed_ms < 500", "iteration < 10"
        result = eval(expression, {"__builtins__": {}}, eval_context)  # noqa: S307
        branch = "true" if bool(result) else "false"
    except Exception as exc:
        return {
            "status": "error",
            "error": f"Condition evaluation failed: {exc}",
            "branch_taken": "false",
        }

    return {
        "status": "success",
        "node_type": "condition",
        "branch_taken": branch,
    }


def _exec_set_variable(
    config: dict,
    flow_vars: dict[str, str],
    node_results: dict[str, dict],
) -> dict:
    assignments = config.get("assignments", [])
    new_vars: dict[str, str] = {}

    for assignment in assignments:
        key = assignment.get("key", "")
        value = assignment.get("value", "")
        if not key:
            continue

        # Resolve {{variable}} references in value
        resolved = re.sub(
            r"\{\{(\w+)\}\}",
            lambda m: flow_vars.get(m.group(1), m.group(0)),
            value,
        )
        new_vars[key] = resolved

    return {
        "status": "success",
        "node_type": "set_variable",
        "variables": new_vars,
    }


# ---------------------------------------------------------------------------
# Main streaming runner
# ---------------------------------------------------------------------------

async def run_test_flow_stream(
    db: Session,
    flow: TestFlow,
    environment_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Async generator yielding SSE events for test flow execution."""
    nodes: dict[str, TestFlowNode] = {n.id: n for n in flow.nodes}
    edges: list[TestFlowEdge] = list(flow.edges)

    # Build adjacency
    outgoing: dict[str, list[TestFlowEdge]] = defaultdict(list)
    incoming: dict[str, list[TestFlowEdge]] = defaultdict(list)
    for e in edges:
        outgoing[e.source_node_id].append(e)
        incoming[e.target_node_id].append(e)

    # Topological sort (with cycle detection)
    try:
        execution_order = _topological_sort(nodes, outgoing, incoming)
    except ValueError as exc:
        yield _sse({"type": "error", "error": str(exc)})
        yield _sse({"type": "done", "summary": {
            "total_nodes": 0, "passed_count": 0, "failed_count": 0,
            "skipped_count": 0, "total_assertions": 0,
            "passed_assertions": 0, "failed_assertions": 0, "total_time_ms": 0,
        }, "final_variables": {}})
        return

    executable = [nid for nid in execution_order if nodes[nid].node_type != "group"]
    total = len(executable)
    yield _sse({"type": "start", "total_nodes": total, "flow_name": flow.name})

    # Flow variables (accumulated)
    flow_vars: dict[str, str] = dict(flow.variables or {})

    # Track node results for condition/assertion evaluation
    node_results: dict[str, dict] = {}
    skipped_nodes: set[str] = set()
    exec_index = 0

    for node_id in execution_order:
        node = nodes[node_id]
        if node.node_type == "group":
            continue

        if node_id in skipped_nodes:
            yield _sse({
                "type": "node_skipped",
                "node_id": node_id,
                "node_type": node.node_type,
                "node_label": node.label,
                "reason": "branch_not_taken",
            })
            node_results[node_id] = {"status": "skipped"}
            exec_index += 1
            continue

        yield _sse({
            "type": "node_start",
            "node_id": node_id,
            "node_type": node.node_type,
            "label": node.label,
        })

        # Animate active incoming edges
        for e in incoming.get(node_id, []):
            if e.source_node_id not in skipped_nodes:
                yield _sse({"type": "edge_active", "edge_id": e.id})

        config = node.config or {}
        start_time = time.perf_counter()

        try:
            if node.node_type == "http_request":
                result = await _exec_http_request(
                    db, config, flow_vars, environment_id, None
                )
            elif node.node_type == "collection":
                result = await _exec_collection(
                    db, config, flow_vars, environment_id
                )
            elif node.node_type == "assertion":
                result = _exec_assertion(
                    config, node_results, incoming, node_id, nodes
                )
            elif node.node_type == "script":
                result = await _exec_script(config, flow_vars, node_results)
            elif node.node_type == "delay":
                result = await _exec_delay(config)
            elif node.node_type == "condition":
                result = _exec_condition(
                    config, flow_vars, node_results, incoming, node_id, nodes
                )
            elif node.node_type == "set_variable":
                result = _exec_set_variable(config, flow_vars, node_results)
            elif node.node_type == "websocket":
                result = await _exec_websocket(
                    config, flow_vars, environment_id
                )
            elif node.node_type == "graphql":
                result = await _exec_graphql(
                    db, config, flow_vars, environment_id, None
                )
            elif node.node_type == "loop":
                result = await _exec_loop(
                    db, node, config, flow_vars, node_results,
                    environment_id, outgoing, incoming, nodes, skipped_nodes,
                )
                # Yield loop sub-events
                for sub_event in result.pop("_sub_events", []):
                    yield _sse(sub_event)
            else:
                result = {
                    "status": "error",
                    "error": f"Unknown node type: {node.node_type}",
                }
        except Exception as exc:
            result = {
                "status": "error",
                "error": str(exc),
            }

        elapsed = (time.perf_counter() - start_time) * 1000
        result["elapsed_ms"] = round(elapsed, 2)
        result["execution_order"] = exec_index
        result["node_label"] = node.label
        result["node_type"] = node.node_type

        node_results[node_id] = result

        # Update flow variables from result
        if result.get("variables"):
            flow_vars.update(result["variables"])

        yield _sse({"type": "node_result", "node_id": node_id, **result})

        # Handle condition / assertion branching
        if node.node_type in ("condition", "assertion") and result.get("branch_taken"):
            _mark_inactive_branch(
                node_id, result["branch_taken"], outgoing, nodes, skipped_nodes
            )

        exec_index += 1

    # Build summary
    summary = _build_summary(node_results)
    yield _sse({
        "type": "done",
        "summary": summary,
        "final_variables": flow_vars,
    })


async def _exec_loop(
    db: Session,
    node: TestFlowNode,
    config: dict,
    flow_vars: dict[str, str],
    node_results: dict[str, dict],
    environment_id: str | None,
    outgoing: dict[str, list[TestFlowEdge]],
    incoming: dict[str, list[TestFlowEdge]],
    nodes: dict[str, TestFlowNode],
    skipped_nodes: set[str],
) -> dict:
    """Execute a loop node: re-run the FULL downstream subgraph each iteration."""
    mode = config.get("mode", "count")
    count = config.get("count", 1)
    max_iterations = config.get("max_iterations", 100)

    # Identify direct loop body targets and done targets
    loop_body_starts: list[str] = []
    done_targets: list[str] = []
    for edge in outgoing.get(node.id, []):
        if edge.source_handle == "source-loop":
            loop_body_starts.append(edge.target_node_id)
        else:
            done_targets.append(edge.target_node_id)

    # BFS to collect ALL nodes reachable from loop body (the full subgraph)
    # Stop at done_targets — those are outside the loop body
    done_set = set(done_targets)
    loop_body_nodes: list[str] = []
    visited_body: set[str] = set()
    bfs_queue: deque[str] = deque(loop_body_starts)
    while bfs_queue:
        nid = bfs_queue.popleft()
        if nid in visited_body or nid in done_set or nid == node.id:
            continue
        if nid not in nodes:
            continue
        visited_body.add(nid)
        loop_body_nodes.append(nid)
        for edge in outgoing.get(nid, []):
            bfs_queue.append(edge.target_node_id)

    # Build mini topological order for loop body nodes
    body_set = set(loop_body_nodes)
    body_in_degree: dict[str, int] = {nid: 0 for nid in loop_body_nodes}
    for nid in loop_body_nodes:
        for edge in incoming.get(nid, []):
            if edge.source_node_id in body_set or edge.source_node_id == node.id:
                body_in_degree[nid] = body_in_degree.get(nid, 0)
                # Only count edges from within the body or the loop node itself
        # Recalculate: count only edges whose source is in body_set or is the loop node
        body_in_degree[nid] = sum(
            1 for e in incoming.get(nid, [])
            if e.source_node_id in body_set
        )

    topo_queue: deque[str] = deque(
        nid for nid in loop_body_nodes if body_in_degree[nid] == 0
    )
    body_order: list[str] = []
    while topo_queue:
        nid = topo_queue.popleft()
        body_order.append(nid)
        for edge in outgoing.get(nid, []):
            tid = edge.target_node_id
            if tid in body_set:
                body_in_degree[tid] -= 1
                if body_in_degree[tid] == 0:
                    topo_queue.append(tid)

    sub_events: list[dict] = []

    if mode == "count":
        iterations = min(count, max_iterations)
    else:
        iterations = max_iterations

    completed = 0
    last_http_result: dict | None = None

    for i in range(1, iterations + 1):
        completed = i
        sub_events.append({
            "type": "loop_iteration",
            "node_id": node.id,
            "iteration": i,
            "total": iterations if mode == "count" else max_iterations,
        })

        last_http_result = None
        body_skipped: set[str] = set()

        # Execute full loop body in topological order
        for body_nid in body_order:
            if body_nid in body_skipped:
                sub_events.append({
                    "type": "node_skipped",
                    "node_id": body_nid,
                    "iteration": i,
                    "reason": "branch_not_taken",
                })
                continue

            body_node = nodes[body_nid]
            cfg = body_node.config or {}

            try:
                if body_node.node_type == "http_request":
                    r = await _exec_http_request(
                        db, cfg, flow_vars, environment_id, None
                    )
                elif body_node.node_type == "collection":
                    r = await _exec_collection(db, cfg, flow_vars, environment_id)
                elif body_node.node_type == "delay":
                    r = await _exec_delay(cfg)
                elif body_node.node_type == "script":
                    r = await _exec_script(cfg, flow_vars, node_results)
                elif body_node.node_type == "set_variable":
                    r = _exec_set_variable(cfg, flow_vars, node_results)
                elif body_node.node_type == "assertion":
                    r = _exec_assertion(
                        cfg, node_results, incoming, body_nid, nodes
                    )
                elif body_node.node_type == "condition":
                    r = _exec_condition(
                        cfg, flow_vars, node_results, incoming, body_nid, nodes,
                        iteration=i,
                    )
                elif body_node.node_type == "websocket":
                    r = await _exec_websocket(cfg, flow_vars, environment_id)
                elif body_node.node_type == "graphql":
                    r = await _exec_graphql(
                        db, cfg, flow_vars, environment_id, None
                    )
                else:
                    r = {"status": "success", "node_type": body_node.node_type}
            except Exception as exc:
                r = {"status": "error", "error": str(exc)}

            r["iteration"] = i
            if r.get("variables"):
                flow_vars.update(r["variables"])
            node_results[body_nid] = r

            # Track last HTTP result for condition evaluation
            if body_node.node_type in ("http_request", "collection"):
                last_http_result = r

            sub_events.append({
                "type": "node_result",
                "node_id": body_nid,
                "iteration": i,
                **r,
            })

            # Handle branching within loop body
            if body_node.node_type in ("condition", "assertion") and r.get("branch_taken"):
                # Mark inactive branch nodes within body
                inactive_handle = (
                    "source-false" if r["branch_taken"] == "true" else "source-true"
                )
                inactive_starts: list[str] = []
                active_starts: list[str] = []
                for edge in outgoing.get(body_nid, []):
                    if edge.target_node_id in body_set:
                        if edge.source_handle == inactive_handle:
                            inactive_starts.append(edge.target_node_id)
                        else:
                            active_starts.append(edge.target_node_id)
                # BFS inactive within body
                inactive_reach: set[str] = set()
                q: deque[str] = deque(inactive_starts)
                while q:
                    sid = q.popleft()
                    if sid in inactive_reach or sid not in body_set:
                        continue
                    inactive_reach.add(sid)
                    for e in outgoing.get(sid, []):
                        if e.target_node_id in body_set:
                            q.append(e.target_node_id)
                # BFS active within body
                active_reach: set[str] = set()
                q = deque(active_starts)
                while q:
                    sid = q.popleft()
                    if sid in active_reach or sid not in body_set:
                        continue
                    active_reach.add(sid)
                    for e in outgoing.get(sid, []):
                        if e.target_node_id in body_set:
                            q.append(e.target_node_id)
                for sid in inactive_reach - active_reach:
                    body_skipped.add(sid)

        # Mark all loop body nodes as handled so main loop skips them
        for body_nid in loop_body_nodes:
            skipped_nodes.add(body_nid)

        # For condition mode: evaluate condition with full HTTP context
        if mode == "condition":
            cond = config.get("condition", "false")
            cond_context: dict[str, Any] = {
                "vars": dict(flow_vars),
                "iteration": i,
            }
            # Add HTTP context from last body result
            if last_http_result:
                cond_context["status_code"] = last_http_result.get("status_code")
                cond_context["response_body"] = last_http_result.get("response_body", "")
                cond_context["response_headers"] = last_http_result.get("response_headers", {})
                cond_context["elapsed_ms"] = last_http_result.get("elapsed_ms")
            try:
                result = eval(cond, {"__builtins__": {}}, cond_context)  # noqa: S307
                if not bool(result):
                    break
            except Exception:
                break

    return {
        "status": "success",
        "node_type": "loop",
        "iterations_completed": completed if loop_body_nodes else 0,
        "_sub_events": sub_events,
    }


def _build_summary(node_results: dict[str, dict]) -> dict:
    """Build execution summary from all node results."""
    total = 0
    passed = 0
    failed = 0
    skipped = 0
    total_assertions = 0
    passed_assertions = 0
    failed_assertions = 0
    total_time = 0.0

    for result in node_results.values():
        status = result.get("status", "")
        if status == "skipped":
            skipped += 1
            total += 1
            continue

        total += 1
        if status == "success":
            passed += 1
        elif status == "error":
            failed += 1

        total_time += result.get("elapsed_ms", 0) or 0

        # Count assertion results
        for ar in result.get("assertion_results", []) or []:
            total_assertions += 1
            if ar.get("passed"):
                passed_assertions += 1
            else:
                failed_assertions += 1

    return {
        "total_nodes": total,
        "passed_count": passed,
        "failed_count": failed,
        "skipped_count": skipped,
        "total_assertions": total_assertions,
        "passed_assertions": passed_assertions,
        "failed_assertions": failed_assertions,
        "total_time_ms": round(total_time, 2),
    }
