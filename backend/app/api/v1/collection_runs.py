import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.collection_run import CollectionRun, CollectionRunResult
from app.models.user import User
from app.schemas.collection_run import (
    CollectionRunCreate,
    CollectionRunDetailOut,
    CollectionRunSummaryOut,
)

router = APIRouter()

MAX_BODY_SIZE = 50_000


@router.post("/", response_model=CollectionRunSummaryOut, status_code=201)
def save_run(
    payload: CollectionRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = CollectionRun(
        collection_id=payload.collection_id,
        user_id=current_user.id,
        environment_id=payload.environment_id,
        collection_name=payload.collection_name,
        environment_name=payload.environment_name,
        iterations=payload.iterations,
        delay_ms=payload.delay_ms,
        status=payload.status,
        total_requests=payload.total_requests,
        passed_count=payload.passed_count,
        failed_count=payload.failed_count,
        total_tests=payload.total_tests,
        passed_tests=payload.passed_tests,
        failed_tests=payload.failed_tests,
        total_time_ms=payload.total_time_ms,
        finished_at=datetime.utcnow(),
    )
    db.add(run)
    db.flush()

    for r in payload.results:
        body = r.response_body
        if body and len(body) > MAX_BODY_SIZE:
            body = body[:MAX_BODY_SIZE]

        db.add(CollectionRunResult(
            run_id=run.id,
            iteration=r.iteration,
            sort_index=r.sort_index,
            item_id=r.item_id,
            request_name=r.request_name,
            method=r.method,
            status=r.status,
            error=r.error,
            status_code=r.status_code,
            elapsed_ms=r.elapsed_ms,
            size_bytes=r.size_bytes,
            response_headers=r.response_headers,
            response_body=body,
            test_results=r.test_results,
            console_logs=r.console_logs,
        ))

    db.commit()
    db.refresh(run)
    return run


@router.get("/", response_model=list[CollectionRunSummaryOut])
def list_runs(
    collection_id: str = Query(...),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = (
        db.query(CollectionRun)
        .filter(
            CollectionRun.collection_id == collection_id,
            CollectionRun.user_id == current_user.id,
        )
        .order_by(CollectionRun.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return runs


@router.get("/{run_id}", response_model=CollectionRunDetailOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(CollectionRun).filter(
        CollectionRun.id == run_id,
        CollectionRun.user_id == current_user.id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(CollectionRun).filter(
        CollectionRun.id == run_id,
        CollectionRun.user_id == current_user.id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    db.delete(run)
    db.commit()


@router.get("/{run_id}/export")
def export_run(
    run_id: str,
    format: str = Query(default="json", regex="^(json|html)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(CollectionRun).filter(
        CollectionRun.id == run_id,
        CollectionRun.user_id == current_user.id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if format == "json":
        return _export_json(run)
    return _export_html(run)


def _export_json(run: CollectionRun) -> Response:
    data = {
        "collection": run.collection_name,
        "run_id": run.id,
        "run_date": run.created_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "environment": run.environment_name,
        "iterations": run.iterations,
        "status": run.status,
        "summary": {
            "total_requests": run.total_requests,
            "passed": run.passed_count,
            "failed": run.failed_count,
            "total_tests": run.total_tests,
            "passed_tests": run.passed_tests,
            "failed_tests": run.failed_tests,
            "total_time_ms": run.total_time_ms,
        },
        "results": [
            {
                "iteration": r.iteration,
                "request_name": r.request_name,
                "method": r.method,
                "status": r.status,
                "error": r.error,
                "status_code": r.status_code,
                "elapsed_ms": r.elapsed_ms,
                "size_bytes": r.size_bytes,
                "tests": r.test_results or [],
                "logs": r.console_logs or [],
            }
            for r in run.results
        ],
    }
    content = json.dumps(data, indent=2, ensure_ascii=False)
    filename = f"run-report-{run.id[:8]}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _export_html(run: CollectionRun) -> Response:
    rows = ""
    for r in run.results:
        test_html = ""
        if r.test_results:
            for t in r.test_results:
                icon = "&#10004;" if t.get("passed") else "&#10008;"
                color = "#22c55e" if t.get("passed") else "#ef4444"
                err = f' <span style="color:#ef4444;font-size:0.8em">({t["error"]})</span>' if t.get("error") else ""
                test_html += f'<div style="color:{color}">{icon} {t.get("name", "")}{err}</div>'

        log_html = ""
        if r.console_logs:
            log_html = '<div style="background:#1e293b;color:#94a3b8;padding:6px 10px;border-radius:4px;font-size:0.8em;margin-top:4px">'
            for log in r.console_logs:
                log_html += f"<div>{log}</div>"
            log_html += "</div>"

        sc = r.status_code or "--"
        sc_color = "#22c55e" if r.status_code and 200 <= r.status_code < 300 else "#f59e0b" if r.status_code and 300 <= r.status_code < 400 else "#ef4444"
        ms = f"{r.elapsed_ms:.0f} ms" if r.elapsed_ms else "--"
        err_row = f'<div style="color:#ef4444;font-size:0.85em">{r.error}</div>' if r.error else ""

        rows += f"""
        <tr>
            <td>{r.iteration}</td>
            <td><span style="color:{_method_color(r.method)};font-weight:700;font-size:0.8em">{r.method}</span></td>
            <td>{r.request_name}{err_row}</td>
            <td><span style="color:{sc_color};font-weight:700">{sc}</span></td>
            <td>{ms}</td>
            <td>{test_html}{log_html}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Run Report — {run.collection_name}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; background: #0d1117; color: #c9d1d9; }}
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
<h1>{run.collection_name}</h1>
<div class="meta">
  Run: {run.created_at.strftime("%Y-%m-%d %H:%M:%S")} &middot;
  Status: <strong>{run.status}</strong> &middot;
  Environment: {run.environment_name or "None"} &middot;
  Iterations: {run.iterations}
</div>
<div class="summary">
  <div class="stat"><div class="val">{run.total_requests}</div><div class="label">Requests</div></div>
  <div class="stat"><div class="val" style="color:#22c55e">{run.passed_count}</div><div class="label">Passed</div></div>
  <div class="stat"><div class="val" style="color:#ef4444">{run.failed_count}</div><div class="label">Failed</div></div>
  <div class="stat"><div class="val">{run.total_tests}</div><div class="label">Tests</div></div>
  <div class="stat"><div class="val" style="color:#22c55e">{run.passed_tests}</div><div class="label">Tests Passed</div></div>
  <div class="stat"><div class="val" style="color:#ef4444">{run.failed_tests}</div><div class="label">Tests Failed</div></div>
  <div class="stat"><div class="val">{run.total_time_ms:.0f} ms</div><div class="label">Total Time</div></div>
</div>
<table>
<thead><tr><th>#</th><th>Method</th><th>Name</th><th>Status</th><th>Time</th><th>Tests / Logs</th></tr></thead>
<tbody>{rows}</tbody>
</table>
</body></html>"""

    filename = f"run-report-{run.id[:8]}.html"
    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _method_color(method: str) -> str:
    return {
        "GET": "#34d399",
        "POST": "#fbbf24",
        "PUT": "#818cf8",
        "PATCH": "#f472b6",
        "DELETE": "#f87171",
        "HEAD": "#38bdf8",
        "OPTIONS": "#a78bfa",
    }.get(method, "#8b949e")
