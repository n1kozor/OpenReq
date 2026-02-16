import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.test_flow import (
    TestFlow,
    TestFlowEdge,
    TestFlowNode,
    TestFlowRun,
    TestFlowRunResult,
)
from app.models.user import User
from app.schemas.test_flow import (
    TestFlowCreate,
    TestFlowDetailOut,
    TestFlowRunCreate,
    TestFlowRunDetailOut,
    TestFlowRunSummaryOut,
    TestFlowSummaryOut,
    TestFlowUpdate,
)

router = APIRouter()

MAX_BODY_SIZE = 50_000


# ── Helpers ──


def _get_flow(flow_id: str, db: Session, user: User) -> TestFlow:
    flow = (
        db.query(TestFlow)
        .filter(TestFlow.id == flow_id, TestFlow.owner_id == user.id)
        .first()
    )
    if not flow:
        raise HTTPException(status_code=404, detail="Test flow not found")
    return flow


def _sync_nodes_edges(
    db: Session,
    flow: TestFlow,
    nodes_data: list | None,
    edges_data: list | None,
):
    """Replace all nodes/edges for a flow (wholesale update)."""
    if nodes_data is not None:
        db.query(TestFlowNode).filter(TestFlowNode.flow_id == flow.id).delete()
        for n in nodes_data:
            db.add(
                TestFlowNode(
                    id=n.id,
                    flow_id=flow.id,
                    node_type=n.node_type,
                    label=n.label,
                    position_x=n.position_x,
                    position_y=n.position_y,
                    config=n.config,
                    parent_node_id=n.parent_node_id,
                )
            )

    if edges_data is not None:
        db.query(TestFlowEdge).filter(TestFlowEdge.flow_id == flow.id).delete()
        for e in edges_data:
            db.add(
                TestFlowEdge(
                    id=e.id,
                    flow_id=flow.id,
                    source_node_id=e.source_node_id,
                    target_node_id=e.target_node_id,
                    source_handle=e.source_handle,
                    target_handle=e.target_handle,
                    label=e.label,
                )
            )


# ── CRUD ──


@router.post("/", response_model=TestFlowDetailOut, status_code=201)
def create_flow(
    payload: TestFlowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    flow = TestFlow(
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
        workspace_id=payload.workspace_id,
        variables=payload.variables,
    )
    db.add(flow)
    db.flush()

    _sync_nodes_edges(db, flow, payload.nodes, payload.edges)

    db.commit()
    db.refresh(flow)
    return flow


@router.get("/", response_model=list[TestFlowSummaryOut])
def list_flows(
    workspace_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(TestFlow).filter(TestFlow.owner_id == current_user.id)
    if workspace_id:
        q = q.filter(TestFlow.workspace_id == workspace_id)
    return q.order_by(TestFlow.updated_at.desc()).all()


@router.get("/{flow_id}", response_model=TestFlowDetailOut)
def get_flow(
    flow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_flow(flow_id, db, current_user)


@router.patch("/{flow_id}", response_model=TestFlowDetailOut)
def update_flow(
    flow_id: str,
    payload: TestFlowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    flow = _get_flow(flow_id, db, current_user)

    if payload.name is not None:
        flow.name = payload.name
    if payload.description is not None:
        flow.description = payload.description
    if payload.viewport is not None:
        flow.viewport = payload.viewport
    if payload.variables is not None:
        flow.variables = payload.variables

    _sync_nodes_edges(db, flow, payload.nodes, payload.edges)

    db.commit()
    db.refresh(flow)
    return flow


@router.delete("/{flow_id}", status_code=204)
def delete_flow(
    flow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    flow = _get_flow(flow_id, db, current_user)
    db.delete(flow)
    db.commit()


@router.post("/{flow_id}/duplicate", response_model=TestFlowDetailOut, status_code=201)
def duplicate_flow(
    flow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    original = _get_flow(flow_id, db, current_user)

    # Map old node IDs to new node IDs
    node_id_map: dict[str, str] = {}
    for n in original.nodes:
        node_id_map[n.id] = str(uuid.uuid4())

    new_flow = TestFlow(
        name=f"{original.name} (Copy)",
        description=original.description,
        owner_id=current_user.id,
        workspace_id=original.workspace_id,
        viewport=original.viewport,
        variables=dict(original.variables) if original.variables else None,
    )
    db.add(new_flow)
    db.flush()

    for n in original.nodes:
        db.add(
            TestFlowNode(
                id=node_id_map[n.id],
                flow_id=new_flow.id,
                node_type=n.node_type,
                label=n.label,
                position_x=n.position_x,
                position_y=n.position_y,
                config=dict(n.config) if n.config else None,
                parent_node_id=node_id_map.get(n.parent_node_id) if n.parent_node_id else None,
            )
        )

    for e in original.edges:
        src = node_id_map.get(e.source_node_id, e.source_node_id)
        tgt = node_id_map.get(e.target_node_id, e.target_node_id)
        db.add(
            TestFlowEdge(
                flow_id=new_flow.id,
                source_node_id=src,
                target_node_id=tgt,
                source_handle=e.source_handle,
                target_handle=e.target_handle,
                label=e.label,
            )
        )

    db.commit()
    db.refresh(new_flow)
    return new_flow


# ── Execution ──


@router.post("/{flow_id}/run")
async def run_flow(
    flow_id: str,
    environment_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Eagerly load relationships to avoid DetachedInstanceError in async generator
    flow = (
        db.query(TestFlow)
        .options(joinedload(TestFlow.nodes), joinedload(TestFlow.edges))
        .filter(TestFlow.id == flow_id, TestFlow.owner_id == current_user.id)
        .first()
    )
    if not flow:
        raise HTTPException(status_code=404, detail="Test flow not found")

    from app.services.test_flow_runner import run_test_flow_stream

    return StreamingResponse(
        run_test_flow_stream(db, flow, environment_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Run Reports ──


@router.post("/{flow_id}/runs", response_model=TestFlowRunSummaryOut, status_code=201)
def save_run(
    flow_id: str,
    payload: TestFlowRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_flow(flow_id, db, current_user)

    run = TestFlowRun(
        flow_id=flow_id,
        user_id=current_user.id,
        environment_id=payload.environment_id,
        flow_name=payload.flow_name,
        environment_name=payload.environment_name,
        status=payload.status,
        total_nodes=payload.total_nodes,
        passed_count=payload.passed_count,
        failed_count=payload.failed_count,
        skipped_count=payload.skipped_count,
        total_assertions=payload.total_assertions,
        passed_assertions=payload.passed_assertions,
        failed_assertions=payload.failed_assertions,
        total_time_ms=payload.total_time_ms,
        final_variables=payload.final_variables,
        finished_at=datetime.utcnow(),
    )
    db.add(run)
    db.flush()

    for r in payload.results:
        body = r.response_body
        if body and len(body) > MAX_BODY_SIZE:
            body = body[:MAX_BODY_SIZE]

        db.add(
            TestFlowRunResult(
                run_id=run.id,
                node_id=r.node_id,
                node_type=r.node_type,
                node_label=r.node_label,
                execution_order=r.execution_order,
                iteration=r.iteration,
                status=r.status,
                error=r.error,
                elapsed_ms=r.elapsed_ms,
                status_code=r.status_code,
                response_body=body,
                response_headers=r.response_headers,
                size_bytes=r.size_bytes,
                assertion_results=r.assertion_results,
                console_logs=r.console_logs,
                variables_snapshot=r.variables_snapshot,
                branch_taken=r.branch_taken,
            )
        )

    db.commit()
    db.refresh(run)
    return run


@router.get("/{flow_id}/runs", response_model=list[TestFlowRunSummaryOut])
def list_runs(
    flow_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(TestFlowRun)
        .filter(
            TestFlowRun.flow_id == flow_id,
            TestFlowRun.user_id == current_user.id,
        )
        .order_by(TestFlowRun.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/runs/{run_id}", response_model=TestFlowRunDetailOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = (
        db.query(TestFlowRun)
        .filter(TestFlowRun.id == run_id, TestFlowRun.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = (
        db.query(TestFlowRun)
        .filter(TestFlowRun.id == run_id, TestFlowRun.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    db.delete(run)
    db.commit()


@router.get("/runs/{run_id}/export")
def export_run(
    run_id: str,
    format: str = Query(default="json", pattern="^(json|html)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = (
        db.query(TestFlowRun)
        .filter(TestFlowRun.id == run_id, TestFlowRun.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if format == "json":
        return _export_json(run)
    return _export_html(run)


def _export_json(run: TestFlowRun) -> Response:
    data = {
        "flow": run.flow_name,
        "run_id": run.id,
        "run_date": run.created_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "environment": run.environment_name,
        "status": run.status,
        "summary": {
            "total_nodes": run.total_nodes,
            "passed": run.passed_count,
            "failed": run.failed_count,
            "skipped": run.skipped_count,
            "total_assertions": run.total_assertions,
            "passed_assertions": run.passed_assertions,
            "failed_assertions": run.failed_assertions,
            "total_time_ms": run.total_time_ms,
        },
        "final_variables": run.final_variables,
        "results": [
            {
                "node_id": r.node_id,
                "node_type": r.node_type,
                "node_label": r.node_label,
                "execution_order": r.execution_order,
                "iteration": r.iteration,
                "status": r.status,
                "error": r.error,
                "elapsed_ms": r.elapsed_ms,
                "status_code": r.status_code,
                "size_bytes": r.size_bytes,
                "assertion_results": r.assertion_results,
                "console_logs": r.console_logs,
                "branch_taken": r.branch_taken,
            }
            for r in run.results
        ],
    }
    content = json.dumps(data, indent=2, ensure_ascii=False)
    filename = f"flow-report-{run.id[:8]}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _export_html(run: TestFlowRun) -> Response:
    rows = ""
    for r in run.results:
        assertion_html = ""
        if r.assertion_results:
            for a in r.assertion_results:
                icon = "&#10004;" if a.get("passed") else "&#10008;"
                color = "#22c55e" if a.get("passed") else "#ef4444"
                err = (
                    f' <span style="color:#ef4444;font-size:0.8em">({a["error"]})</span>'
                    if a.get("error")
                    else ""
                )
                assertion_html += f'<div style="color:{color}">{icon} {a.get("name", "")}{err}</div>'

        sc = r.status_code or "--"
        sc_color = (
            "#22c55e"
            if r.status_code and 200 <= r.status_code < 300
            else "#f59e0b"
            if r.status_code and 300 <= r.status_code < 400
            else "#ef4444"
        )
        ms = f"{r.elapsed_ms:.0f} ms" if r.elapsed_ms else "--"
        status_color = {
            "success": "#22c55e",
            "error": "#ef4444",
            "skipped": "#8b949e",
        }.get(r.status, "#8b949e")
        err_row = (
            f'<div style="color:#ef4444;font-size:0.85em">{r.error}</div>'
            if r.error
            else ""
        )

        rows += f"""
        <tr>
            <td>{r.execution_order}</td>
            <td style="color:{status_color};font-weight:700">{r.status.upper()}</td>
            <td>{r.node_type}</td>
            <td>{r.node_label}{err_row}</td>
            <td><span style="color:{sc_color};font-weight:700">{sc}</span></td>
            <td>{ms}</td>
            <td>{assertion_html}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Flow Report — {run.flow_name}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1060px; margin: 2rem auto; padding: 0 1rem; background: #0d1117; color: #c9d1d9; }}
  h1 {{ font-size: 1.4rem; margin-bottom: 0.3rem; }}
  .meta {{ color: #8b949e; font-size: 0.85rem; margin-bottom: 1.5rem; }}
  .summary {{ display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }}
  .stat {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 80px; }}
  .stat .val {{ font-size: 1.4rem; font-weight: 700; }}
  .stat .label {{ font-size: 0.7rem; text-transform: uppercase; color: #8b949e; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
  th {{ text-align: left; padding: 8px 12px; background: #161b22; border-bottom: 2px solid #30363d; font-size: 0.75rem; text-transform: uppercase; color: #8b949e; }}
  td {{ padding: 8px 12px; border-bottom: 1px solid #21262d; vertical-align: top; }}
  tr:hover {{ background: #161b22; }}
</style>
</head>
<body>
<h1>{run.flow_name}</h1>
<div class="meta">
  Run: {run.created_at.strftime("%Y-%m-%d %H:%M:%S")} &middot;
  Status: <strong>{run.status}</strong> &middot;
  Environment: {run.environment_name or "None"}
</div>
<div class="summary">
  <div class="stat"><div class="val">{run.total_nodes}</div><div class="label">Nodes</div></div>
  <div class="stat"><div class="val" style="color:#22c55e">{run.passed_count}</div><div class="label">Passed</div></div>
  <div class="stat"><div class="val" style="color:#ef4444">{run.failed_count}</div><div class="label">Failed</div></div>
  <div class="stat"><div class="val" style="color:#8b949e">{run.skipped_count}</div><div class="label">Skipped</div></div>
  <div class="stat"><div class="val">{run.total_assertions}</div><div class="label">Assertions</div></div>
  <div class="stat"><div class="val" style="color:#22c55e">{run.passed_assertions}</div><div class="label">Passed</div></div>
  <div class="stat"><div class="val" style="color:#ef4444">{run.failed_assertions}</div><div class="label">Failed</div></div>
  <div class="stat"><div class="val">{run.total_time_ms:.0f} ms</div><div class="label">Total Time</div></div>
</div>
<table>
<thead><tr><th>#</th><th>Status</th><th>Type</th><th>Label</th><th>Code</th><th>Time</th><th>Assertions</th></tr></thead>
<tbody>{rows}</tbody>
</table>
</body></html>"""

    filename = f"flow-report-{run.id[:8]}.html"
    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
