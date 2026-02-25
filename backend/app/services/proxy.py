import asyncio
import base64
import re
import ssl
import time
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.collection import Collection, CollectionItem
from app.models.environment import Environment
from app.models.request import AuthType
from app.models.workspace import Workspace
from app.schemas.proxy import (
    FormDataItem,
    LocalProxyResponse,
    PreparedRequest,
    ProxyRequest,
    ProxyResponse,
    RequestSettings,
    ScriptResultSchema,
)
from app.services.prepare_token import encode_prepare_token, decode_prepare_token
from app.services.script_runner import run_pre_request_script, run_post_response_script
from app.services.js_script_runner import run_pre_request_script_js, run_post_response_script_js


VAR_PATTERN = re.compile(r"\{\{(\w+)\}\}")

# Binary content-type prefixes / patterns
_BINARY_TYPES = {
    "image/", "audio/", "video/", "font/",
    "application/pdf", "application/zip", "application/gzip",
    "application/x-tar", "application/x-7z-compressed",
    "application/x-rar-compressed", "application/octet-stream",
    "application/vnd.ms-excel", "application/vnd.openxmlformats",
    "application/msword", "application/x-bzip2",
    "application/wasm", "application/protobuf",
}

# ── Persistent HTTP client — reuses TCP connections & TLS sessions ──
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=settings.PROXY_REQUEST_TIMEOUT,
            follow_redirects=True,
            http2=True,
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=30,
            ),
        )
    return _client


async def close_proxy_client() -> None:
    """Call on app shutdown to cleanly close the connection pool."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


def _resolve_variables(text: str, variables: dict[str, str]) -> str:
    def replacer(match: re.Match) -> str:
        key = match.group(1)
        val = variables.get(key, match.group(0))
        # JSON columns may store ints/bools/nulls — always coerce to str
        if val is None:
            return ""
        return str(val)
    return VAR_PATTERN.sub(replacer, text)


def _resolve_auth_config(config: dict | None, variables: dict[str, str]) -> dict | None:
    """Resolve {{variables}} inside auth_config string values."""
    if not config:
        return config
    return {k: _resolve_variables(v, variables) if isinstance(v, str) else v
            for k, v in config.items()}


def _resolve_folder_chain(
    db: Session,
    collection_item_id: str | None,
) -> list["CollectionItem"]:
    """Walk from request's CollectionItem up through parent folders.
    Returns list ordered root-first (grandparent → parent)."""
    if not collection_item_id:
        return []
    item = db.query(CollectionItem).filter(CollectionItem.id == collection_item_id).first()
    if not item:
        return []
    chain: list[CollectionItem] = []
    current_parent_id = item.parent_id
    visited: set[str] = set()
    while current_parent_id and current_parent_id not in visited:
        visited.add(current_parent_id)
        parent = db.query(CollectionItem).filter(CollectionItem.id == current_parent_id).first()
        if not parent or not parent.is_folder:
            break
        chain.append(parent)
        current_parent_id = parent.parent_id
    chain.reverse()  # root-first order
    return chain


def _resolve_inherited_auth(
    db: Session,
    collection_item_id: str | None,
    collection: Collection | None,
) -> tuple[AuthType | None, dict | None]:
    """Walk up folder tree to find first explicit auth, fall back to collection."""
    if collection_item_id:
        # Find the item (request's CollectionItem) and walk its parents
        item = db.query(CollectionItem).filter(CollectionItem.id == collection_item_id).first()
        if item:
            current_parent_id = item.parent_id
            visited: set[str] = set()
            while current_parent_id and current_parent_id not in visited:
                visited.add(current_parent_id)
                parent = db.query(CollectionItem).filter(CollectionItem.id == current_parent_id).first()
                if not parent:
                    break
                if parent.auth_type and parent.auth_type not in (None, "", "inherit"):
                    try:
                        return AuthType(parent.auth_type), parent.auth_config
                    except ValueError:
                        pass
                current_parent_id = parent.parent_id

    # Fall back to collection-level auth
    if collection and collection.auth_type:
        try:
            return AuthType(collection.auth_type), collection.auth_config
        except ValueError:
            pass
    return None, None


def _load_environment_variables(db: Session, environment_id: str) -> dict[str, str]:
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        return {}
    return {var.key: var.value for var in env.variables}


def _load_collection_variables(db: Session, collection_id: str) -> dict[str, str]:
    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col or not col.variables:
        return {}
    return {k: str(v) if v is not None else "" for k, v in col.variables.items()}


def _load_workspace_globals(db: Session, collection_id: str | None) -> dict[str, str]:
    """Load workspace-level globals via collection → workspace."""
    if not collection_id:
        return {}
    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col or not col.workspace_id:
        return {}
    ws = db.query(Workspace).filter(Workspace.id == col.workspace_id).first()
    if not ws or not ws.globals:
        return {}
    return {k: str(v) if v is not None else "" for k, v in ws.globals.items()}


def _apply_auth(headers: dict[str, str], auth_type: AuthType, auth_config: dict | None) -> dict[str, str]:
    if not auth_config:
        return headers
    if auth_type == AuthType.BEARER:
        token = auth_config.get("bearer_token") or auth_config.get("token", "")
        headers["Authorization"] = f"Bearer {token}"
    elif auth_type == AuthType.API_KEY:
        key_name = auth_config.get("api_key_name") or auth_config.get("key", "X-API-Key")
        key_value = auth_config.get("api_key_value") or auth_config.get("value", "")
        placement = auth_config.get("api_key_placement") or auth_config.get("placement", "header")
        if placement == "header":
            headers[key_name] = key_value
    elif auth_type == AuthType.BASIC:
        username = auth_config.get("username", "")
        password = auth_config.get("password", "")
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {credentials}"
    elif auth_type == AuthType.OAUTH2:
        token = auth_config.get("token") or auth_config.get("access_token") or auth_config.get("accessToken", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
    return headers


def _is_binary_content_type(content_type: str) -> bool:
    """Check if a content-type indicates binary data."""
    ct = content_type.lower().split(";")[0].strip()
    for prefix in _BINARY_TYPES:
        if ct.startswith(prefix):
            return True
    return False


def _run_pre_script(
    script: str, language: str, variables: dict[str, str],
    url: str = "", method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
    query_params: dict[str, str] | None = None,
    # pm.* scope data
    globals_vars: dict[str, str] | None = None,
    environment_vars: dict[str, str] | None = None,
    collection_vars: dict[str, str] | None = None,
    request_name: str = "",
    iteration: int = 1,
    iteration_count: int = 1,
) -> dict:
    """Run pre-request script (blocking — called via asyncio.to_thread)."""
    pm_kwargs = dict(
        globals_vars=globals_vars, environment_vars=environment_vars,
        collection_vars=collection_vars, request_name=request_name,
        iteration=iteration, iteration_count=iteration_count,
    )
    if language == "javascript":
        return run_pre_request_script_js(
            script=script, variables=variables,
            request_url=url, request_method=method,
            request_headers=headers, request_body=body,
            request_query_params=query_params, **pm_kwargs,
        )
    return run_pre_request_script(
        script=script, variables=variables,
        request_url=url, request_method=method,
        request_headers=headers, request_body=body,
        request_query_params=query_params, **pm_kwargs,
    )


def _run_post_script(
    script: str, language: str, variables: dict[str, str],
    status: int, body: str, headers: dict[str, str], elapsed: float,
    # pm.* scope data
    globals_vars: dict[str, str] | None = None,
    environment_vars: dict[str, str] | None = None,
    collection_vars: dict[str, str] | None = None,
    request_name: str = "",
    iteration: int = 1,
    iteration_count: int = 1,
) -> dict:
    """Run post-response script (blocking — called via asyncio.to_thread)."""
    pm_kwargs = dict(
        globals_vars=globals_vars, environment_vars=environment_vars,
        collection_vars=collection_vars, request_name=request_name,
        iteration=iteration, iteration_count=iteration_count,
    )
    if language == "javascript":
        return run_post_response_script_js(
            script=script, variables=variables,
            response_status=status, response_body=body,
            response_headers=headers, response_time=elapsed, **pm_kwargs,
        )
    return run_post_response_script(
        script=script, variables=variables,
        response_status=status, response_body=body,
        response_headers=headers, response_time=elapsed, **pm_kwargs,
    )


def _apply_script_result(
    pre_result: ScriptResultSchema,
    merged_vars: dict[str, str],
    req_url: str, req_method: str,
    req_headers: dict[str, str],
    req_body: str | None,
    req_params: dict[str, str],
) -> tuple[str, str, dict[str, str], str | None, dict[str, str]]:
    """Apply script result modifications to request state."""
    merged_vars.update(pre_result.variables)
    if pre_result.request_url:
        req_url = pre_result.request_url
    if pre_result.request_method:
        req_method = pre_result.request_method
    if pre_result.request_headers:
        req_headers.update(pre_result.request_headers)
    if pre_result.request_body is not None:
        req_body = pre_result.request_body
    if pre_result.request_query_params:
        req_params.update(pre_result.request_query_params)
    return req_url, req_method, req_headers, req_body, req_params


def _build_per_request_client(rs: RequestSettings) -> httpx.AsyncClient:
    """Create a one-off httpx client configured by per-request settings."""
    verify: bool | ssl.SSLContext = rs.verify_ssl
    if not rs.verify_ssl:
        verify = False

    return httpx.AsyncClient(
        timeout=settings.PROXY_REQUEST_TIMEOUT,
        follow_redirects=rs.follow_redirects,
        max_redirects=rs.max_redirects,
        http2=(rs.http_version == "http2"),
        verify=verify,
    )


def _build_form_data(
    items: list[FormDataItem],
    variables: dict[str, str],
) -> tuple[dict[str, str], list[tuple[str, tuple[str, bytes, str]]]]:
    """Build data dict and files list for httpx multipart from FormDataItem list."""
    data: dict[str, str] = {}
    files: list[tuple[str, tuple[str, bytes, str]]] = []

    for item in items:
        if not item.enabled or not item.key:
            continue
        key = _resolve_variables(item.key, variables)
        if item.type == "file" and item.file_content_base64:
            file_bytes = base64.b64decode(item.file_content_base64)
            file_name = item.file_name or "file"
            # Guess MIME type
            import mimetypes
            mime = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            files.append((key, (file_name, file_bytes, mime)))
        else:
            data[key] = _resolve_variables(item.value, variables)

    return data, files


def _resolve_form_data_snapshot(items: list[FormDataItem], variables: dict[str, str]) -> list[dict]:
    """Resolve variables for form-data snapshot (no file bytes)."""
    snapshot: list[dict] = []
    for item in items:
        if not item.enabled or not item.key:
            continue
        key = _resolve_variables(item.key, variables)
        value = _resolve_variables(item.value or "", variables)
        snapshot.append({
            "key": key,
            "value": value,
            "type": item.type or "text",
            "enabled": item.enabled,
            "file_name": item.file_name,
        })
    return snapshot


def _persist_scope_changes(
    db: Session,
    script_result: ScriptResultSchema,
    collection_id: str | None,
    environment_id: str | None,
) -> None:
    """Apply pm.globals/environment/collectionVariables changes to DB."""
    from app.models.environment import EnvironmentVariable
    changed = False

    # 1. Workspace globals (JSON column on Workspace)
    if script_result.globals_updates and collection_id:
        col = db.query(Collection).filter(Collection.id == collection_id).first()
        if col and col.workspace_id:
            ws = db.query(Workspace).filter(Workspace.id == col.workspace_id).first()
            if ws:
                current = dict(ws.globals or {})
                for key, val in script_result.globals_updates.items():
                    if val is None:
                        current.pop(key, None)
                    else:
                        current[key] = val
                ws.globals = current
                changed = True

    # 2. Environment variables (separate rows in EnvironmentVariable table)
    if script_result.environment_updates and environment_id:
        env = db.query(Environment).filter(Environment.id == environment_id).first()
        if env:
            existing = {v.key: v for v in env.variables}
            for key, val in script_result.environment_updates.items():
                if val is None:
                    if key in existing:
                        db.delete(existing[key])
                        changed = True
                elif key in existing:
                    existing[key].value = val
                    changed = True
                else:
                    db.add(EnvironmentVariable(
                        environment_id=environment_id, key=key, value=val,
                    ))
                    changed = True

    # 3. Collection variables (JSON column on Collection)
    if script_result.collection_var_updates and collection_id:
        col = db.query(Collection).filter(Collection.id == collection_id).first()
        if col:
            current = dict(col.variables or {})
            for key, val in script_result.collection_var_updates.items():
                if val is None:
                    current.pop(key, None)
                else:
                    current[key] = val
            col.variables = current
            changed = True

    if changed:
        db.commit()


async def _run_prepare_phase(
    db: Session,
    proxy_req: ProxyRequest,
    extra_variables: dict[str, str] | None = None,
) -> tuple[
    str, str, dict[str, str], str | None, dict[str, str],  # url, method, headers, body, params
    dict[str, str],  # merged_vars
    dict,  # pm_kwargs
    Collection | None,  # collection
    list[CollectionItem],  # folder_chain
    ScriptResultSchema | None,  # combined_pre
    str | None,  # body_type
    RequestSettings | None,  # request_settings
]:
    """Phase 1: Merge variables, run pre-scripts, resolve auth. Shared by prepare & execute."""
    # ── 1. Merge variables: globals < collection < folders (root→leaf) < environment < extra ──
    merged_vars: dict[str, str] = {}
    collection: Collection | None = None

    ws_globals = _load_workspace_globals(db, proxy_req.collection_id)
    col_vars: dict[str, str] = {}
    env_vars: dict[str, str] = {}

    merged_vars.update(ws_globals)
    if proxy_req.collection_id:
        collection = db.query(Collection).filter(Collection.id == proxy_req.collection_id).first()
        if collection and collection.variables:
            col_vars = {k: str(v) if v is not None else "" for k, v in collection.variables.items()}
            merged_vars.update(col_vars)
    folder_chain = _resolve_folder_chain(db, proxy_req.collection_item_id)
    for folder in folder_chain:
        if folder.variables:
            merged_vars.update({k: str(v) if v is not None else "" for k, v in folder.variables.items()})
    if proxy_req.environment_id:
        env_vars = _load_environment_variables(db, proxy_req.environment_id)
        merged_vars.update(env_vars)
    if extra_variables:
        merged_vars.update(extra_variables)

    pm_kwargs = dict(
        globals_vars=dict(ws_globals),
        environment_vars=dict(env_vars),
        collection_vars=dict(col_vars),
        request_name=proxy_req.request_name,
        iteration=proxy_req.iteration,
        iteration_count=proxy_req.iteration_count,
    )

    req_url = proxy_req.url
    req_method = proxy_req.method.value
    req_headers = dict(proxy_req.headers or {})
    req_body = proxy_req.body
    req_params = dict(proxy_req.query_params or {})

    # ── Apply collection/folder defaults (headers, query params, body) ──
    default_headers: dict[str, str] = {}
    default_params: dict[str, str] = {}
    default_body: str | None = None
    default_body_type: str | None = None

    if collection:
        if collection.default_headers:
            default_headers.update({k: "" if v is None else str(v) for k, v in collection.default_headers.items()})
        if collection.default_query_params:
            default_params.update({k: "" if v is None else str(v) for k, v in collection.default_query_params.items()})
        if collection.default_body:
            default_body = collection.default_body
        if collection.default_body_type:
            default_body_type = collection.default_body_type

    for folder in folder_chain:
        if folder.default_headers:
            default_headers.update({k: "" if v is None else str(v) for k, v in folder.default_headers.items()})
        if folder.default_query_params:
            default_params.update({k: "" if v is None else str(v) for k, v in folder.default_query_params.items()})
        if folder.default_body:
            default_body = folder.default_body
        if folder.default_body_type:
            default_body_type = folder.default_body_type

    if default_headers:
        default_headers.update(req_headers)
        req_headers = default_headers
    if default_params:
        default_params.update(req_params)
        req_params = default_params

    if (req_body is None or str(req_body).strip() == "") and not proxy_req.form_data and default_body:
        req_body = default_body
        if not proxy_req.body_type and default_body_type:
            proxy_req.body_type = default_body_type

        if default_body_type:
            has_ct = any(k.lower() == "content-type" for k in req_headers.keys())
            if not has_ct:
                if default_body_type == "json":
                    req_headers["Content-Type"] = "application/json"
                elif default_body_type == "xml":
                    req_headers["Content-Type"] = "application/xml"
                elif default_body_type == "text":
                    req_headers["Content-Type"] = "text/plain"

    # ── 2a. Collection-level pre-request script ──
    col_pre_result: ScriptResultSchema | None = None
    if collection and collection.pre_request_script and collection.pre_request_script.strip():
        col_lang = collection.script_language or "python"
        raw = await asyncio.to_thread(
            _run_pre_script, collection.pre_request_script, col_lang,
            dict(merged_vars),
            url=req_url, method=req_method,
            headers=dict(req_headers), body=req_body,
            query_params=dict(req_params), **pm_kwargs,
        )
        col_pre_result = ScriptResultSchema(**raw)
        req_url, req_method, req_headers, req_body, req_params = _apply_script_result(
            col_pre_result, merged_vars, req_url, req_method, req_headers, req_body, req_params,
        )

    # ── 2b. Folder-level pre-request scripts ──
    folder_pre_results: list[ScriptResultSchema] = []
    for folder in folder_chain:
        if folder.pre_request_script and folder.pre_request_script.strip():
            f_lang = folder.script_language or "python"
            raw = await asyncio.to_thread(
                _run_pre_script, folder.pre_request_script, f_lang,
                dict(merged_vars),
                url=req_url, method=req_method,
                headers=dict(req_headers), body=req_body,
                query_params=dict(req_params), **pm_kwargs,
            )
            f_result = ScriptResultSchema(**raw)
            req_url, req_method, req_headers, req_body, req_params = _apply_script_result(
                f_result, merged_vars, req_url, req_method, req_headers, req_body, req_params,
            )
            folder_pre_results.append(f_result)

    # ── 2c. Request-level pre-request script ──
    pre_result: ScriptResultSchema | None = None
    if proxy_req.pre_request_script and proxy_req.pre_request_script.strip():
        raw = await asyncio.to_thread(
            _run_pre_script, proxy_req.pre_request_script, proxy_req.script_language,
            dict(merged_vars),
            url=req_url, method=req_method,
            headers=dict(req_headers), body=req_body,
            query_params=dict(req_params), **pm_kwargs,
        )
        pre_result = ScriptResultSchema(**raw)
        req_url, req_method, req_headers, req_body, req_params = _apply_script_result(
            pre_result, merged_vars, req_url, req_method, req_headers, req_body, req_params,
        )

    # Combine pre-request results
    combined_pre: ScriptResultSchema | None = None
    all_pre = [r for r in [col_pre_result, *folder_pre_results, pre_result] if r]
    if all_pre:
        combined_pre = ScriptResultSchema(
            variables=dict(merged_vars),
            logs=[log for r in all_pre for log in r.logs],
            test_results=[t for r in all_pre for t in r.test_results],
            request_headers=req_headers,
            globals_updates={k: v for r in all_pre for k, v in r.globals_updates.items()},
            environment_updates={k: v for r in all_pre for k, v in r.environment_updates.items()},
            collection_var_updates={k: v for r in all_pre for k, v in r.collection_var_updates.items()},
        )
        _persist_scope_changes(db, combined_pre, proxy_req.collection_id, proxy_req.environment_id)

    # ── 3. Resolve variables in URL, headers, body, params ──
    url = _resolve_variables(req_url, merged_vars)
    headers = {k: _resolve_variables(v, merged_vars) for k, v in req_headers.items()}
    body = _resolve_variables(req_body, merged_vars) if req_body else None
    params = {k: _resolve_variables(v, merged_vars) for k, v in req_params.items()}

    # ── 3b. URL encoding ──
    rs = proxy_req.request_settings
    if rs and rs.encode_url:
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(url)
        encoded_path = quote(parts.path, safe="/:@!$&'()*+,;=-._~")
        url = urlunsplit((parts.scheme, parts.netloc, encoded_path, parts.query, parts.fragment))

    # ── 4. Auth: request-level > folder tree > collection ──
    if proxy_req.auth_type and proxy_req.auth_type not in (AuthType.NONE, AuthType.INHERIT):
        resolved_ac = _resolve_auth_config(proxy_req.auth_config, merged_vars)
        headers = _apply_auth(headers, proxy_req.auth_type, resolved_ac)
    else:
        inherited_type, inherited_config = _resolve_inherited_auth(
            db, proxy_req.collection_item_id, collection
        )
        if inherited_type and inherited_type not in (AuthType.NONE, AuthType.INHERIT):
            resolved_ac = _resolve_auth_config(inherited_config, merged_vars)
            headers = _apply_auth(headers, inherited_type, resolved_ac)

    return (
        url, req_method, headers, body, params,
        merged_vars, pm_kwargs, collection, folder_chain,
        combined_pre, proxy_req.body_type, rs,
    )


async def _run_complete_phase(
    db: Session,
    status_code: int,
    reason_phrase: str,
    response_body: str,
    response_headers: dict[str, str],
    elapsed_ms: float,
    is_binary: bool,
    content_type: str,
    body_base64: str | None,
    merged_vars: dict[str, str],
    pm_kwargs: dict,
    collection: Collection | None,
    folder_chain: list[CollectionItem],
    post_response_script: str | None,
    script_language: str,
    collection_id: str | None,
    environment_id: str | None,
    combined_pre: ScriptResultSchema | None,
) -> ProxyResponse:
    """Phase 2: Run post-response scripts, persist changes, return final response."""
    # ── 8a. Collection-level post-response script ──
    col_post_result: ScriptResultSchema | None = None
    if collection and collection.post_response_script and collection.post_response_script.strip():
        col_lang = collection.script_language or "python"
        raw = await asyncio.to_thread(
            _run_post_script, collection.post_response_script, col_lang,
            dict(merged_vars),
            status_code, response_body, response_headers, round(elapsed_ms, 2),
            **pm_kwargs,
        )
        col_post_result = ScriptResultSchema(**raw)
        merged_vars.update(col_post_result.variables)

    # ── 8b. Folder-level post-response scripts ──
    folder_post_results: list[ScriptResultSchema] = []
    for folder in folder_chain:
        if folder.post_response_script and folder.post_response_script.strip():
            f_lang = folder.script_language or "python"
            raw = await asyncio.to_thread(
                _run_post_script, folder.post_response_script, f_lang,
                dict(merged_vars),
                status_code, response_body, response_headers, round(elapsed_ms, 2),
                **pm_kwargs,
            )
            f_result = ScriptResultSchema(**raw)
            merged_vars.update(f_result.variables)
            folder_post_results.append(f_result)

    # ── 8c. Request-level post-response script ──
    post_result: ScriptResultSchema | None = None
    if post_response_script and post_response_script.strip():
        raw = await asyncio.to_thread(
            _run_post_script, post_response_script, script_language,
            dict(merged_vars),
            status_code, response_body, response_headers, round(elapsed_ms, 2),
            **pm_kwargs,
        )
        post_result = ScriptResultSchema(**raw)
        merged_vars.update(post_result.variables)

    # Combine post results
    combined_post: ScriptResultSchema | None = None
    all_post = [r for r in [col_post_result, *folder_post_results, post_result] if r]
    if all_post:
        combined_post = ScriptResultSchema(
            variables=dict(merged_vars),
            logs=[log for r in all_post for log in r.logs],
            test_results=[t for r in all_post for t in r.test_results],
            request_headers={},
            globals_updates={k: v for r in all_post for k, v in r.globals_updates.items()},
            environment_updates={k: v for r in all_post for k, v in r.environment_updates.items()},
            collection_var_updates={k: v for r in all_post for k, v in r.collection_var_updates.items()},
        )
        _persist_scope_changes(db, combined_post, collection_id, environment_id)

    return ProxyResponse(
        status_code=status_code,
        reason_phrase=reason_phrase,
        headers=response_headers,
        body=response_body,
        elapsed_ms=round(elapsed_ms, 2),
        size_bytes=len(response_body.encode()) if response_body else 0,
        is_binary=is_binary,
        content_type=content_type,
        body_base64=body_base64,
        pre_request_result=combined_pre,
        script_result=combined_post,
    )


# ── Public API: prepare / complete / execute ──

async def prepare_proxy_request(
    db: Session,
    proxy_req: ProxyRequest,
    extra_variables: dict[str, str] | None = None,
) -> PreparedRequest:
    """Resolve variables, run pre-scripts, apply auth. Returns a fully resolved request
    ready for local execution, plus a signed token for the /complete call."""
    (
        url, method, headers, body, params,
        merged_vars, pm_kwargs, collection, folder_chain,
        combined_pre, body_type, rs,
    ) = await _run_prepare_phase(db, proxy_req, extra_variables)
    resolved_form_data = _resolve_form_data_snapshot(proxy_req.form_data, merged_vars) if proxy_req.form_data else None

    # Build token context for /complete
    token_ctx = {
        "collection_id": proxy_req.collection_id,
        "environment_id": proxy_req.environment_id,
        "collection_item_id": proxy_req.collection_item_id,
        "post_response_script": proxy_req.post_response_script,
        "script_language": proxy_req.script_language,
        "merged_vars": merged_vars,
        "pm_kwargs": pm_kwargs,
        "folder_chain_ids": [f.id for f in folder_chain],
        "collection_id_for_scripts": collection.id if collection else None,
        "request_method": method,
        "request_url": url,
        "request_headers": dict(headers or {}),
        "request_body": body,
        "request_query_params": params,
        "request_body_type": body_type,
        "request_form_data": resolved_form_data,
    }
    token = encode_prepare_token(token_ctx)

    return PreparedRequest(
        url=url,
        method=method,
        headers=headers,
        body=body,
        body_type=body_type,
        query_params=params,
        form_data=resolved_form_data,
        request_settings=rs,
        pre_request_result=combined_pre,
        prepare_token=token,
    )


async def complete_proxy_request(
    db: Session,
    local_resp: LocalProxyResponse,
    current_user_id: str,
) -> ProxyResponse:
    """Run post-response scripts, save history, persist pm.* changes."""
    ctx = decode_prepare_token(local_resp.prepare_token)

    # Reconstruct folder chain from IDs
    folder_chain: list[CollectionItem] = []
    for fid in ctx.get("folder_chain_ids", []):
        item = db.query(CollectionItem).filter(CollectionItem.id == fid).first()
        if item:
            folder_chain.append(item)

    # Reconstruct collection
    collection: Collection | None = None
    col_id_for_scripts = ctx.get("collection_id_for_scripts")
    if col_id_for_scripts:
        collection = db.query(Collection).filter(Collection.id == col_id_for_scripts).first()

    merged_vars = ctx.get("merged_vars", {})
    pm_kwargs = ctx.get("pm_kwargs", {})

    response_body = local_resp.body
    response_headers = local_resp.headers

    response = await _run_complete_phase(
        db=db,
        status_code=local_resp.status_code,
        reason_phrase="",
        response_body=response_body,
        response_headers=response_headers,
        elapsed_ms=local_resp.elapsed_ms,
        is_binary=local_resp.is_binary,
        content_type=local_resp.content_type,
        body_base64=local_resp.body_base64,
        merged_vars=merged_vars,
        pm_kwargs=pm_kwargs,
        collection=collection,
        folder_chain=folder_chain,
        post_response_script=ctx.get("post_response_script"),
        script_language=ctx.get("script_language", "python"),
        collection_id=ctx.get("collection_id"),
        environment_id=ctx.get("environment_id"),
        combined_pre=None,  # already sent in prepare
    )

    resolved_request = {
        "method": ctx.get("request_method", "GET"),
        "url": ctx.get("request_url", ""),
        "headers": ctx.get("request_headers") or {},
        "query_params": ctx.get("request_query_params") or {},
        "body": ctx.get("request_body"),
        "body_type": ctx.get("request_body_type"),
        "form_data": ctx.get("request_form_data") or None,
    }

    # Save to history
    from app.models.history import RequestHistory
    db.add(RequestHistory(
        user_id=current_user_id,
        method=resolved_request["method"],
        url=resolved_request["url"],
        request_headers=resolved_request["headers"],
        request_body=resolved_request["body"],
        resolved_request=resolved_request,
        status_code=local_resp.status_code,
        response_headers=local_resp.headers,
        response_body=response_body[:50000] if response_body and not local_resp.is_binary else None,
        elapsed_ms=local_resp.elapsed_ms,
        size_bytes=local_resp.size_bytes,
    ))
    db.commit()

    response.resolved_request = resolved_request
    return response


async def execute_proxy_request(
    db: Session,
    proxy_req: ProxyRequest,
    extra_variables: dict[str, str] | None = None,
) -> ProxyResponse:
    """Full server-side proxy: prepare → HTTP call → complete. Used by /proxy/send."""
    (
        url, method, headers, body, params,
        merged_vars, pm_kwargs, collection, folder_chain,
        combined_pre, body_type, rs,
    ) = await _run_prepare_phase(db, proxy_req, extra_variables)

    # ── 5. Build request kwargs based on body type ──
    request_kwargs: dict = {
        "method": method,
        "url": url,
        "headers": headers,
        "params": params,
    }

    bt = body_type or ""

    if bt == "x-www-form-urlencoded" and proxy_req.form_data:
        form_dict: dict[str, str] = {}
        for item in proxy_req.form_data:
            if item.enabled and item.key:
                k = _resolve_variables(item.key, merged_vars)
                v = _resolve_variables(item.value, merged_vars)
                form_dict[k] = v
        request_kwargs["data"] = form_dict
    elif bt == "x-www-form-urlencoded" and body:
        import json
        try:
            form_dict = json.loads(body)
            form_dict = {k: _resolve_variables(v, merged_vars) if isinstance(v, str) else v
                         for k, v in form_dict.items()}
            request_kwargs["data"] = form_dict
        except (json.JSONDecodeError, AttributeError):
            request_kwargs["content"] = body
    elif bt == "form-data" and proxy_req.form_data:
        data, files = _build_form_data(proxy_req.form_data, merged_vars)
        if files:
            request_kwargs["data"] = data
            request_kwargs["files"] = files
        elif data:
            request_kwargs["data"] = data
            request_kwargs["files"] = []
    elif bt == "form-data" and body:
        import json
        try:
            form_dict = json.loads(body)
            request_kwargs["data"] = form_dict
            request_kwargs["files"] = []
        except (json.JSONDecodeError, AttributeError):
            request_kwargs["content"] = body
    else:
        if body:
            request_kwargs["content"] = body

    # ── 6. Select client ──
    use_per_request_client = rs is not None
    client: httpx.AsyncClient

    if use_per_request_client:
        assert rs is not None
        client = _build_per_request_client(rs)
    else:
        client = _get_client()

    try:
        start = time.perf_counter()
        response = await client.request(**request_kwargs)
        elapsed_ms = (time.perf_counter() - start) * 1000
    finally:
        if use_per_request_client:
            await client.aclose()

    # ── 7. Handle response: binary vs text ──
    raw_ct = ""
    for k, v in response.headers.items():
        if k.lower() == "content-type":
            raw_ct = v
            break

    is_binary = _is_binary_content_type(raw_ct)
    size_bytes = len(response.content)

    if is_binary:
        response_body = ""
        body_b64 = base64.b64encode(response.content).decode("ascii")
    else:
        response_body = response.text
        body_b64 = None

    response_headers = dict(response.headers)
    reason_phrase = response.reason_phrase or ""

    resp = await _run_complete_phase(
        db=db,
        status_code=response.status_code,
        reason_phrase=reason_phrase,
        response_body=response_body,
        response_headers=response_headers,
        elapsed_ms=elapsed_ms,
        is_binary=is_binary,
        content_type=raw_ct,
        body_base64=body_b64,
        merged_vars=merged_vars,
        pm_kwargs=pm_kwargs,
        collection=collection,
        folder_chain=folder_chain,
        post_response_script=proxy_req.post_response_script,
        script_language=proxy_req.script_language,
        collection_id=proxy_req.collection_id,
        environment_id=proxy_req.environment_id,
        combined_pre=combined_pre,
    )
    resolved_request = {
        "method": method,
        "url": url,
        "headers": headers,
        "query_params": params,
        "body": body,
        "body_type": body_type,
        "form_data": _resolve_form_data_snapshot(proxy_req.form_data, merged_vars) if proxy_req.form_data else None,
    }
    resp.resolved_request = resolved_request
    return resp
