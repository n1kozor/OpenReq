"""
API endpoints for import/export (Postman, OpenAPI, cURL).
"""
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.collection import Collection, CollectionItem
from app.models.request import Request, HttpMethod, AuthType
from app.models.user import User
from app.models.environment import Environment, EnvironmentVariable, EnvironmentType
from app.models.workspace import Workspace
from app.services.import_export import (
    parse_postman_collection,
    parse_postman_environment,
    _extract_variable_references,
    parse_openapi,
    parse_curl,
    generate_curl,
    export_to_postman,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Helpers ──

AUTH_TYPE_MAP = {
    "none": AuthType.NONE,
    "inherit": AuthType.INHERIT,
    "bearer": AuthType.BEARER,
    "basic": AuthType.BASIC,
    "api_key": AuthType.API_KEY,
    "oauth2": AuthType.OAUTH2,
}


def _create_items_recursive(
    db: Session,
    collection_id: str,
    items: list[dict],
    parent_id: str | None = None,
    sort_start: int = 0,
) -> int:
    """Recursively create collection items and requests from parsed data."""
    sort_order = sort_start
    for item in items:
        if item.get("type") == "folder":
            folder_auth = item.get("auth_type", "none")
            folder = CollectionItem(
                id=str(uuid.uuid4()),
                collection_id=collection_id,
                name=item["name"],
                is_folder=True,
                parent_id=parent_id,
                sort_order=sort_order,
                auth_type=folder_auth if folder_auth != "none" else None,
                auth_config=item.get("auth_config") or None,
                description=item.get("description") or None,
                variables=item.get("variables") or None,
                pre_request_script=item.get("pre_request_script") or None,
                post_response_script=item.get("post_response_script") or None,
                script_language=item.get("script_language") or None,
            )
            db.add(folder)
            db.flush()
            sort_order += 1
            sort_order = _create_items_recursive(
                db, collection_id, item.get("children", []), folder.id, sort_order
            )
        else:
            # Create request
            method_str = item.get("method", "GET").upper()
            try:
                method = HttpMethod(method_str)
            except ValueError:
                method = HttpMethod.GET

            auth_type = AUTH_TYPE_MAP.get(item.get("auth_type", "none"), AuthType.NONE)

            # Detect GraphQL protocol
            body_type = item.get("body_type", "none")
            protocol = "http"
            settings = None
            if body_type == "graphql":
                protocol = "graphql"
                gql_vars = item.get("graphql_variables")
                if gql_vars:
                    settings = {"graphql_variables": gql_vars}

            req = Request(
                id=str(uuid.uuid4()),
                name=item.get("name", "Request"),
                method=method,
                url=item.get("url", ""),
                headers=item.get("headers") or {},
                body=item.get("body"),
                body_type=body_type,
                auth_type=auth_type,
                auth_config=item.get("auth_config") or {},
                query_params=item.get("query_params") or {},
                pre_request_script=item.get("pre_request_script") or None,
                post_response_script=item.get("post_response_script") or None,
                form_data=item.get("form_data") or None,
                protocol=protocol,
                settings=settings,
            )
            db.add(req)
            db.flush()

            ci = CollectionItem(
                id=str(uuid.uuid4()),
                collection_id=collection_id,
                name=item.get("name", "Request"),
                is_folder=False,
                parent_id=parent_id,
                request_id=req.id,
                sort_order=sort_order,
                description=item.get("description") or None,
            )
            db.add(ci)
            sort_order += 1

    return sort_order


# ── Import Postman Collection ──

@router.post("/import/postman")
async def import_postman(
    file: UploadFile = File(...),
    workspace_id: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import a Postman Collection (v1 or v2.1) JSON file."""
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    try:
        parsed = parse_postman_collection(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Postman collection: {e}")

    col_vars = {v["key"]: v["value"] for v in parsed.get("variables", [])}
    scripts = parsed.get("scripts", {})
    col_auth_type = parsed.get("auth_type", "none")

    col = Collection(
        name=parsed["name"],
        description=parsed.get("description", ""),
        owner_id=current_user.id,
        workspace_id=workspace_id,
        variables=col_vars if col_vars else {},
        auth_type=col_auth_type if col_auth_type != "none" else None,
        auth_config=parsed.get("auth_config") or None,
        pre_request_script=scripts.get("pre_request") or None,
        post_response_script=scripts.get("post_response") or None,
        script_language="javascript" if (scripts.get("pre_request") or scripts.get("post_response")) else None,
    )
    db.add(col)
    db.flush()

    _create_items_recursive(db, col.id, parsed["items"])
    db.commit()
    db.refresh(col)

    total = db.query(CollectionItem).filter(
        CollectionItem.collection_id == col.id, CollectionItem.is_folder == False
    ).count()

    return {
        "collection_id": col.id,
        "collection_name": col.name,
        "total_requests": total,
    }


# ── Helpers for env type detection ──

def _detect_env_type(name: str, explicit_mapping: dict[str, str] | None = None) -> EnvironmentType:
    """Detect environment type from name, with optional explicit mapping."""
    if explicit_mapping and name in explicit_mapping:
        try:
            return EnvironmentType(explicit_mapping[name])
        except ValueError:
            pass
    name_upper = name.upper()
    if "LIVE" in name_upper or "PROD" in name_upper:
        return EnvironmentType.LIVE
    if "TEST" in name_upper or "STAGING" in name_upper or "QA" in name_upper:
        return EnvironmentType.TEST
    return EnvironmentType.DEV


def _count_items(items: list[dict]) -> tuple[int, int, int]:
    """Count requests, folders, and scripts in parsed items recursively."""
    requests = 0
    folders = 0
    scripts = 0
    for item in items:
        if item.get("type") == "folder":
            folders += 1
            r, f, s = _count_items(item.get("children", []))
            requests += r
            folders += f
            scripts += s
        else:
            requests += 1
            if item.get("pre_request_script") or item.get("post_response_script"):
                scripts += 1
    return requests, folders, scripts


async def _read_json(file: UploadFile) -> dict:
    """Read and parse JSON from an UploadFile."""
    content = await file.read()
    return json.loads(content)


# ── Import Postman Full (Preview) ──

@router.post("/import/postman/preview")
async def preview_postman_import(
    collection_file: UploadFile | None = File(default=None),
    environment_files: list[UploadFile] = File(default=[]),
    globals_file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
):
    """Analyze Postman files and return a preview without creating anything.

    All file parameters are optional, but at least one must be provided.
    """
    # Parse collection (optional)
    col_preview = None
    var_refs: set[str] = set()
    scripts_count = 0
    if collection_file:
        try:
            col_data = await _read_json(collection_file)
        except (json.JSONDecodeError, Exception):
            raise HTTPException(status_code=400, detail="Invalid JSON in collection file")

        try:
            parsed = parse_postman_collection(col_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse collection: {e}")

        total_requests, total_folders, scripts_count = _count_items(parsed["items"])
        var_refs = _extract_variable_references(parsed["items"])

        col_preview = {
            "name": parsed["name"],
            "description": parsed.get("description", ""),
            "total_requests": total_requests,
            "total_folders": total_folders,
            "collection_variables_count": len(parsed.get("variables", [])),
            "has_pre_request_script": bool(parsed.get("scripts", {}).get("pre_request")),
            "has_post_response_script": bool(parsed.get("scripts", {}).get("post_response")),
            "request_scripts_count": scripts_count,
        }

    # Parse environments
    env_previews = []
    all_env_vars: set[str] = set()
    for ef in environment_files:
        try:
            env_data = await _read_json(ef)
            env_parsed = parse_postman_environment(env_data)
            env_var_keys = {v["key"] for v in env_parsed["variables"]}
            all_env_vars |= env_var_keys
            env_previews.append({
                "filename": ef.filename or "unknown",
                "name": env_parsed["name"],
                "variables_count": len(env_parsed["variables"]),
                "detected_type": _detect_env_type(env_parsed["name"]).value,
                "variables": [v["key"] for v in env_parsed["variables"]],
            })
        except Exception:
            env_previews.append({
                "filename": ef.filename or "unknown",
                "name": "Parse Error",
                "variables_count": 0,
                "detected_type": "DEV",
                "variables": [],
                "error": True,
            })

    # Parse globals
    globals_preview = None
    if globals_file:
        try:
            globals_data = await _read_json(globals_file)
            globals_parsed = parse_postman_environment(globals_data)
            globals_var_keys = {v["key"] for v in globals_parsed["variables"]}
            all_env_vars |= globals_var_keys
            globals_preview = {
                "filename": globals_file.filename or "unknown",
                "name": globals_parsed["name"],
                "variables_count": len(globals_parsed["variables"]),
            }
        except Exception:
            globals_preview = {
                "filename": globals_file.filename or "unknown",
                "name": "Parse Error",
                "variables_count": 0,
                "error": True,
            }

    # Variable crosscheck
    variables_used = sorted(var_refs)
    variables_provided = sorted(all_env_vars)

    return {
        "collection": col_preview,
        "environments": env_previews,
        "globals": globals_preview,
        "variables_used_in_collection": variables_used,
        "variables_provided": variables_provided,
    }


# ── Import Postman Full (Execute) ──

@router.post("/import/postman/full")
async def import_postman_full(
    workspace_id: str = Form(...),
    collection_file: UploadFile | None = File(default=None),
    environment_files: list[UploadFile] = File(default=[]),
    globals_file: UploadFile | None = File(default=None),
    env_type_mapping: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import a full Postman workspace: collection + environments + globals.

    All file parameters are optional, but at least one must be provided.
    """
    type_mapping = {}
    if env_type_mapping:
        try:
            type_mapping = json.loads(env_type_mapping)
        except json.JSONDecodeError:
            pass

    # 1. Parse and create collection (optional)
    col_info = None
    scripts_count = 0
    if collection_file:
        try:
            col_data = await _read_json(collection_file)
        except (json.JSONDecodeError, Exception):
            raise HTTPException(status_code=400, detail="Invalid JSON in collection file")

        try:
            parsed = parse_postman_collection(col_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse collection: {e}")

        col_vars = {v["key"]: v["value"] for v in parsed.get("variables", [])}
        scripts = parsed.get("scripts", {})
        col_auth_type = parsed.get("auth_type", "none")

        col = Collection(
            name=parsed["name"],
            description=parsed.get("description", ""),
            owner_id=current_user.id,
            workspace_id=workspace_id,
            variables=col_vars if col_vars else {},
            auth_type=col_auth_type if col_auth_type != "none" else None,
            auth_config=parsed.get("auth_config") or None,
            pre_request_script=scripts.get("pre_request") or None,
            post_response_script=scripts.get("post_response") or None,
            script_language="javascript" if (scripts.get("pre_request") or scripts.get("post_response")) else None,
        )
        db.add(col)
        db.flush()

        _create_items_recursive(db, col.id, parsed["items"])

        total_requests, total_folders, scripts_count = _count_items(parsed["items"])

        col_info = {
            "id": col.id,
            "name": col.name,
            "total_requests": total_requests,
            "total_folders": total_folders,
            "collection_variables_count": len(col_vars),
        }

    # 2. Create environments from env files
    created_envs = []
    errors = []
    for ef in environment_files:
        try:
            env_data = await _read_json(ef)
            env_parsed = parse_postman_environment(env_data)
            env_type = _detect_env_type(
                env_parsed["name"],
                type_mapping,
            )
            env = Environment(
                id=str(uuid.uuid4()),
                name=env_parsed["name"],
                env_type=env_type,
                workspace_id=workspace_id,
            )
            db.add(env)
            db.flush()

            for var in env_parsed["variables"]:
                db.add(EnvironmentVariable(
                    id=str(uuid.uuid4()),
                    environment_id=env.id,
                    key=var["key"],
                    value=var["value"],
                    is_secret=var["is_secret"],
                ))

            created_envs.append({
                "id": env.id,
                "name": env.name,
                "env_type": env.env_type.value,
                "variables_count": len(env_parsed["variables"]),
            })
        except Exception as e:
            errors.append(f"Environment '{ef.filename}': {e}")

    # 3. Save globals to workspace.globals (not as a separate environment)
    globals_info = None
    if globals_file:
        try:
            globals_data = await _read_json(globals_file)
            globals_parsed = parse_postman_environment(globals_data)
            ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
            if ws:
                globals_dict = {v["key"]: v["value"] for v in globals_parsed["variables"]}
                # Merge with existing globals (imported values overwrite)
                existing = ws.globals or {}
                existing.update(globals_dict)
                ws.globals = existing

                globals_info = {
                    "name": globals_parsed["name"],
                    "variables_count": len(globals_parsed["variables"]),
                }
        except Exception as e:
            errors.append(f"Globals: {e}")

    db.commit()

    return {
        "collection": col_info,
        "environments": created_envs,
        "globals": globals_info,
        "request_scripts_count": scripts_count,
        "errors": errors,
    }


# ── Import OpenAPI/Swagger ──

@router.post("/import/openapi")
async def import_openapi(
    file: UploadFile = File(...),
    workspace_id: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import an OpenAPI/Swagger spec (JSON or YAML)."""
    content = (await file.read()).decode("utf-8")

    try:
        parsed = parse_openapi(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse OpenAPI spec: {e}")

    col = Collection(
        name=parsed["name"],
        description=parsed.get("description", ""),
        owner_id=current_user.id,
        workspace_id=workspace_id,
    )
    db.add(col)
    db.flush()

    _create_items_recursive(db, col.id, parsed["items"])
    db.commit()
    db.refresh(col)

    total = db.query(CollectionItem).filter(
        CollectionItem.collection_id == col.id, CollectionItem.is_folder == False
    ).count()

    return {
        "collection_id": col.id,
        "collection_name": col.name,
        "total_requests": total,
    }


# ── Import cURL ──

class CurlImportRequest(BaseModel):
    curl_command: str
    name: str | None = None
    collection_id: str | None = None


@router.post("/import/curl")
async def import_curl(
    payload: CurlImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse a cURL command and create a request."""
    try:
        parsed = parse_curl(payload.curl_command)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse cURL: {e}")

    method_str = parsed.get("method", "GET").upper()
    try:
        method = HttpMethod(method_str)
    except ValueError:
        method = HttpMethod.GET

    auth_type = AUTH_TYPE_MAP.get(parsed.get("auth_type", "none"), AuthType.NONE)

    req = Request(
        name=payload.name or f"{method_str} {parsed.get('url', '')}",
        method=method,
        url=parsed.get("url", ""),
        headers=parsed.get("headers") or {},
        body=parsed.get("body"),
        body_type=parsed.get("body_type", "none"),
        auth_type=auth_type,
        auth_config=parsed.get("auth_config") or {},
        query_params=parsed.get("query_params") or {},
    )
    db.add(req)
    db.flush()

    # If collection_id provided, add to collection
    if payload.collection_id:
        ci = CollectionItem(
            collection_id=payload.collection_id,
            name=req.name,
            is_folder=False,
            request_id=req.id,
        )
        db.add(ci)

    db.commit()
    db.refresh(req)

    return {
        "request_id": req.id,
        "name": req.name,
        "method": req.method.value,
        "url": req.url,
        "parsed": parsed,
    }


# ── Export cURL ──

class CurlExportRequest(BaseModel):
    method: str
    url: str
    headers: dict[str, str] | None = None
    body: str | None = None
    query_params: dict[str, str] | None = None
    auth_type: str = "none"
    auth_config: dict[str, str] | None = None


@router.post("/export/curl")
async def export_curl(
    payload: CurlExportRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a cURL command from request data."""
    curl = generate_curl(
        method=payload.method,
        url=payload.url,
        headers=payload.headers,
        body=payload.body,
        query_params=payload.query_params,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
    )
    return {"curl": curl}


# ── Export helpers ──

def _build_export_tree(db: Session, items: list[CollectionItem], parent_id: str | None = None) -> list[dict]:
    """Build export tree from CollectionItem list, including all folder/request metadata."""
    result = []
    for item in items:
        if item.parent_id != parent_id:
            continue
        if item.is_folder:
            result.append({
                "name": item.name,
                "is_folder": True,
                "description": item.description,
                "auth_type": item.auth_type,
                "auth_config": item.auth_config,
                "variables": item.variables,
                "pre_request_script": item.pre_request_script,
                "post_response_script": item.post_response_script,
                "script_language": item.script_language,
                "children": _build_export_tree(db, items, item.id),
            })
        elif item.request_id:
            req = db.query(Request).filter(Request.id == item.request_id).first()
            if req:
                result.append({
                    "name": item.name,
                    "description": item.description,
                    "method": req.method.value,
                    "url": req.url,
                    "headers": req.headers,
                    "body": req.body,
                    "body_type": req.body_type,
                    "form_data": req.form_data,
                    "auth_type": req.auth_type.value,
                    "auth_config": req.auth_config,
                    "query_params": req.query_params,
                    "pre_request_script": req.pre_request_script,
                    "post_response_script": req.post_response_script,
                    "settings": req.settings,
                    "protocol": req.protocol,
                })
    return result


# ── Export Postman Collection ──

@router.get("/export/postman/{collection_id}")
async def export_postman(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a collection as Postman Collection v2.1 JSON."""
    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    items = db.query(CollectionItem).filter(
        CollectionItem.collection_id == collection_id
    ).order_by(CollectionItem.sort_order).all()

    export_items = _build_export_tree(db, items)
    postman_json = export_to_postman(
        col.name, col.description or "", export_items, col.variables or None,
        collection_auth_type=col.auth_type,
        collection_auth_config=col.auth_config,
        collection_pre_request_script=col.pre_request_script,
        collection_post_response_script=col.post_response_script,
    )

    return postman_json


# ── Export Postman Folder ──

@router.get("/export/postman/folder/{folder_id}")
async def export_postman_folder(
    folder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a folder (and its children) as Postman Collection v2.1 JSON."""
    folder = db.query(CollectionItem).filter(
        CollectionItem.id == folder_id, CollectionItem.is_folder == True
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    col = db.query(Collection).filter(Collection.id == folder.collection_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    items = db.query(CollectionItem).filter(
        CollectionItem.collection_id == folder.collection_id
    ).order_by(CollectionItem.sort_order).all()

    export_items = _build_export_tree(db, items, folder.id)
    postman_json = export_to_postman(
        f"{col.name} - {folder.name}",
        col.description or "",
        export_items,
        col.variables or None,
    )
    return postman_json


# ── Export Postman Request ──

@router.get("/export/postman/request/{request_id}")
async def export_postman_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single request as Postman Collection v2.1 JSON."""
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Find associated CollectionItem for description
    ci = db.query(CollectionItem).filter(CollectionItem.request_id == request_id).first()

    export_items = [{
        "name": req.name,
        "description": ci.description if ci else None,
        "method": req.method.value,
        "url": req.url,
        "headers": req.headers,
        "body": req.body,
        "body_type": req.body_type,
        "form_data": req.form_data,
        "auth_type": req.auth_type.value,
        "auth_config": req.auth_config,
        "query_params": req.query_params,
        "pre_request_script": req.pre_request_script,
        "post_response_script": req.post_response_script,
        "settings": req.settings,
        "protocol": req.protocol,
    }]
    postman_json = export_to_postman(req.name, "", export_items, None)
    return postman_json
