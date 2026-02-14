from typing import Any

from pydantic import BaseModel

from app.models.request import HttpMethod, AuthType


class ScriptResultSchema(BaseModel):
    variables: dict[str, str] = {}
    globals: dict[str, str] = {}
    logs: list[str] = []
    test_results: list[dict[str, Any]] = []
    request_headers: dict[str, str] = {}
    request_url: str | None = None
    request_method: str | None = None
    request_body: str | None = None
    request_query_params: dict[str, str] = {}


class RequestSettings(BaseModel):
    http_version: str = "http2"  # "http1" | "http2"
    verify_ssl: bool = True
    follow_redirects: bool = True
    follow_original_method: bool = False
    follow_auth_header: bool = False
    remove_referer_on_redirect: bool = False
    encode_url: bool = True
    max_redirects: int = 10
    disable_cookie_jar: bool = False
    use_server_cipher_suite: bool = False
    disabled_tls_protocols: list[str] = []


class FormDataItem(BaseModel):
    key: str
    value: str = ""
    type: str = "text"  # "text" | "file"
    enabled: bool = True
    file_name: str | None = None
    file_content_base64: str | None = None  # base64-encoded file bytes


class ProxyRequest(BaseModel):
    method: HttpMethod
    url: str
    headers: dict[str, str] | None = None
    body: str | None = None
    body_type: str | None = None  # "json" | "xml" | "text" | "form-data" | "x-www-form-urlencoded" | "none"
    form_data: list[FormDataItem] | None = None
    query_params: dict[str, str] | None = None
    auth_type: AuthType = AuthType.NONE
    auth_config: dict | None = None
    environment_id: str | None = None
    collection_id: str | None = None
    # Scripts
    pre_request_script: str | None = None
    post_response_script: str | None = None
    script_language: str = "python"  # "python" or "javascript"
    # Per-request HTTP settings
    request_settings: RequestSettings | None = None


class ProxyResponse(BaseModel):
    status_code: int
    headers: dict[str, str]
    body: str
    elapsed_ms: float
    size_bytes: int
    # Binary response support
    is_binary: bool = False
    content_type: str = ""
    body_base64: str | None = None
    # Script results (only present when scripts were executed)
    pre_request_result: ScriptResultSchema | None = None
    script_result: ScriptResultSchema | None = None
