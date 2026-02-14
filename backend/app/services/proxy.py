import asyncio
import base64
import re
import ssl
import time
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.collection import Collection
from app.models.environment import Environment
from app.models.request import AuthType
from app.schemas.proxy import (
    FormDataItem,
    ProxyRequest,
    ProxyResponse,
    RequestSettings,
    ScriptResultSchema,
)
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
        return variables.get(key, match.group(0))
    return VAR_PATTERN.sub(replacer, text)


def _load_environment_variables(db: Session, environment_id: str) -> dict[str, str]:
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        return {}
    return {var.key: var.value for var in env.variables}


def _load_collection_variables(db: Session, collection_id: str) -> dict[str, str]:
    col = db.query(Collection).filter(Collection.id == collection_id).first()
    if not col or not col.variables:
        return {}
    return dict(col.variables)


def _apply_auth(headers: dict[str, str], auth_type: AuthType, auth_config: dict | None) -> dict[str, str]:
    if not auth_config:
        return headers
    if auth_type == AuthType.BEARER:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == AuthType.API_KEY:
        key_name = auth_config.get("key", "X-API-Key")
        key_value = auth_config.get("value", "")
        placement = auth_config.get("placement", "header")
        if placement == "header":
            headers[key_name] = key_value
    elif auth_type == AuthType.BASIC:
        username = auth_config.get("username", "")
        password = auth_config.get("password", "")
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {credentials}"
    elif auth_type == AuthType.OAUTH2:
        token = auth_config.get("token", auth_config.get("access_token", ""))
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
) -> dict:
    """Run pre-request script (blocking — called via asyncio.to_thread)."""
    if language == "javascript":
        return run_pre_request_script_js(
            script=script, variables=variables,
            request_url=url, request_method=method,
            request_headers=headers, request_body=body,
            request_query_params=query_params,
        )
    return run_pre_request_script(
        script=script, variables=variables,
        request_url=url, request_method=method,
        request_headers=headers, request_body=body,
        request_query_params=query_params,
    )


def _run_post_script(
    script: str, language: str, variables: dict[str, str],
    status: int, body: str, headers: dict[str, str], elapsed: float,
) -> dict:
    """Run post-response script (blocking — called via asyncio.to_thread)."""
    if language == "javascript":
        return run_post_response_script_js(
            script=script, variables=variables,
            response_status=status, response_body=body,
            response_headers=headers, response_time=elapsed,
        )
    return run_post_response_script(
        script=script, variables=variables,
        response_status=status, response_body=body,
        response_headers=headers, response_time=elapsed,
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


async def execute_proxy_request(
    db: Session,
    proxy_req: ProxyRequest,
    extra_variables: dict[str, str] | None = None,
) -> ProxyResponse:
    # ── 1. Merge variables: collection vars < environment vars < extra vars ──
    merged_vars: dict[str, str] = {}
    collection: Collection | None = None
    if proxy_req.collection_id:
        collection = db.query(Collection).filter(Collection.id == proxy_req.collection_id).first()
        if collection and collection.variables:
            merged_vars.update(collection.variables)
    if proxy_req.environment_id:
        merged_vars.update(_load_environment_variables(db, proxy_req.environment_id))
    if extra_variables:
        merged_vars.update(extra_variables)

    # Start with the request data from the client
    req_url = proxy_req.url
    req_method = proxy_req.method.value
    req_headers = dict(proxy_req.headers or {})
    req_body = proxy_req.body
    req_params = dict(proxy_req.query_params or {})

    # ── 2a. Run COLLECTION-level pre-request script (runs first) ──
    col_pre_result: ScriptResultSchema | None = None
    if collection and collection.pre_request_script and collection.pre_request_script.strip():
        col_lang = collection.script_language or "python"
        raw = await asyncio.to_thread(
            _run_pre_script, collection.pre_request_script, col_lang,
            dict(merged_vars),
            url=req_url, method=req_method,
            headers=dict(req_headers), body=req_body,
            query_params=dict(req_params),
        )
        col_pre_result = ScriptResultSchema(**raw)
        req_url, req_method, req_headers, req_body, req_params = _apply_script_result(
            col_pre_result, merged_vars, req_url, req_method, req_headers, req_body, req_params,
        )

    # ── 2b. Run REQUEST-level pre-request script (runs second, can override) ──
    pre_result: ScriptResultSchema | None = None
    if proxy_req.pre_request_script and proxy_req.pre_request_script.strip():
        raw = await asyncio.to_thread(
            _run_pre_script, proxy_req.pre_request_script, proxy_req.script_language,
            dict(merged_vars),
            url=req_url, method=req_method,
            headers=dict(req_headers), body=req_body,
            query_params=dict(req_params),
        )
        pre_result = ScriptResultSchema(**raw)
        req_url, req_method, req_headers, req_body, req_params = _apply_script_result(
            pre_result, merged_vars, req_url, req_method, req_headers, req_body, req_params,
        )

    # Combine pre-request results for response (collection + request logs/tests merged)
    combined_pre: ScriptResultSchema | None = None
    if col_pre_result or pre_result:
        combined_pre = ScriptResultSchema(
            variables=dict(merged_vars),
            logs=(col_pre_result.logs if col_pre_result else []) + (pre_result.logs if pre_result else []),
            test_results=(col_pre_result.test_results if col_pre_result else []) + (pre_result.test_results if pre_result else []),
            request_headers=req_headers,
        )

    # ── 3. Resolve variables in URL, headers, body, params ──
    url = _resolve_variables(req_url, merged_vars)
    headers = {k: _resolve_variables(v, merged_vars) for k, v in req_headers.items()}
    body = _resolve_variables(req_body, merged_vars) if req_body else None
    params = {k: _resolve_variables(v, merged_vars) for k, v in req_params.items()}

    # ── 3b. URL encoding if request_settings.encode_url is True ──
    rs = proxy_req.request_settings
    if rs and rs.encode_url:
        # Encode URL path segments (leave scheme/host intact)
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(url)
        encoded_path = quote(parts.path, safe="/:@!$&'()*+,;=-._~")
        url = urlunsplit((parts.scheme, parts.netloc, encoded_path, parts.query, parts.fragment))

    # ── 4. Auth: request-level takes priority, fall back to collection auth ──
    if proxy_req.auth_type and proxy_req.auth_type != AuthType.NONE:
        headers = _apply_auth(headers, proxy_req.auth_type, proxy_req.auth_config)
    elif collection and collection.auth_type:
        try:
            col_auth_type = AuthType(collection.auth_type)
            headers = _apply_auth(headers, col_auth_type, collection.auth_config)
        except ValueError:
            pass

    # ── 5. Build request kwargs based on body type ──
    request_kwargs: dict = {
        "method": req_method,
        "url": url,
        "headers": headers,
        "params": params,
    }

    body_type = proxy_req.body_type or ""

    if body_type == "x-www-form-urlencoded" and proxy_req.form_data:
        # Build URL-encoded form data
        form_dict: dict[str, str] = {}
        for item in proxy_req.form_data:
            if item.enabled and item.key:
                k = _resolve_variables(item.key, merged_vars)
                v = _resolve_variables(item.value, merged_vars)
                form_dict[k] = v
        request_kwargs["data"] = form_dict
    elif body_type == "x-www-form-urlencoded" and body:
        # Fallback: body is a JSON string of key-value pairs (legacy)
        import json
        try:
            form_dict = json.loads(body)
            form_dict = {k: _resolve_variables(v, merged_vars) if isinstance(v, str) else v
                         for k, v in form_dict.items()}
            request_kwargs["data"] = form_dict
        except (json.JSONDecodeError, AttributeError):
            request_kwargs["content"] = body
    elif body_type == "form-data" and proxy_req.form_data:
        # Build multipart form data
        data, files = _build_form_data(proxy_req.form_data, merged_vars)
        if files:
            request_kwargs["data"] = data
            request_kwargs["files"] = files
        elif data:
            # No files, just text fields — still multipart
            request_kwargs["data"] = data
            # Force multipart encoding
            request_kwargs["files"] = []
    elif body_type == "form-data" and body:
        # Legacy fallback: body is JSON string
        import json
        try:
            form_dict = json.loads(body)
            request_kwargs["data"] = form_dict
            request_kwargs["files"] = []
        except (json.JSONDecodeError, AttributeError):
            request_kwargs["content"] = body
    else:
        # Raw body (json, xml, text, or unknown)
        if body:
            request_kwargs["content"] = body

    # ── 6. Select client (per-request or shared) ──
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
        body_base64 = base64.b64encode(response.content).decode("ascii")
    else:
        response_body = response.text
        body_base64 = None

    response_headers = dict(response.headers)

    # ── 8a. Run COLLECTION-level post-response script ──
    col_post_result: ScriptResultSchema | None = None
    if collection and collection.post_response_script and collection.post_response_script.strip():
        col_lang = collection.script_language or "python"
        raw = await asyncio.to_thread(
            _run_post_script, collection.post_response_script, col_lang,
            dict(merged_vars),
            response.status_code, response_body, response_headers, round(elapsed_ms, 2),
        )
        col_post_result = ScriptResultSchema(**raw)
        merged_vars.update(col_post_result.variables)

    # ── 8b. Run REQUEST-level post-response script ──
    post_result: ScriptResultSchema | None = None
    if proxy_req.post_response_script and proxy_req.post_response_script.strip():
        raw = await asyncio.to_thread(
            _run_post_script, proxy_req.post_response_script, proxy_req.script_language,
            dict(merged_vars),
            response.status_code, response_body, response_headers, round(elapsed_ms, 2),
        )
        post_result = ScriptResultSchema(**raw)
        merged_vars.update(post_result.variables)

    # Combine post results
    combined_post: ScriptResultSchema | None = None
    if col_post_result or post_result:
        combined_post = ScriptResultSchema(
            variables=dict(merged_vars),
            logs=(col_post_result.logs if col_post_result else []) + (post_result.logs if post_result else []),
            test_results=(col_post_result.test_results if col_post_result else []) + (post_result.test_results if post_result else []),
            request_headers=req_headers,
        )

    return ProxyResponse(
        status_code=response.status_code,
        headers=response_headers,
        body=response_body,
        elapsed_ms=round(elapsed_ms, 2),
        size_bytes=size_bytes,
        is_binary=is_binary,
        content_type=raw_ct,
        body_base64=body_base64,
        pre_request_result=combined_pre,
        script_result=combined_post,
    )
