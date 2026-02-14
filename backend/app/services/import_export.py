"""
Import/Export service for Postman, OpenAPI, and cURL formats.
"""
import json
import re
import shlex
import uuid
from typing import Any
from urllib.parse import urlparse, parse_qsl

import yaml  # type: ignore


# ────────────────────────────────────────────────────────────
# cURL Parser
# ────────────────────────────────────────────────────────────

def parse_curl(curl_command: str) -> dict[str, Any]:
    """Parse a cURL command string into a request dict."""
    curl_command = curl_command.strip()
    if curl_command.startswith("$"):
        curl_command = curl_command[1:].strip()

    # Normalize line continuations
    curl_command = re.sub(r"\\\s*\n", " ", curl_command)
    curl_command = re.sub(r"\s+", " ", curl_command)

    try:
        parts = shlex.split(curl_command)
    except ValueError:
        parts = curl_command.split()

    if not parts or parts[0].lower() != "curl":
        raise ValueError("Not a valid cURL command")

    url = ""
    method = "GET"
    headers: dict[str, str] = {}
    body: str | None = None
    body_type = "none"
    auth_type = "none"
    auth_config: dict[str, str] = {}
    query_params: dict[str, str] = {}

    i = 1
    while i < len(parts):
        arg = parts[i]

        if arg in ("-X", "--request"):
            i += 1
            if i < len(parts):
                method = parts[i].upper()
        elif arg in ("-H", "--header"):
            i += 1
            if i < len(parts):
                header = parts[i]
                if ":" in header:
                    key, value = header.split(":", 1)
                    headers[key.strip()] = value.strip()
        elif arg in ("-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"):
            i += 1
            if i < len(parts):
                body = parts[i]
                if method == "GET":
                    method = "POST"
                # Detect body type from content-type header or body content
                ct = next((v for k, v in headers.items() if k.lower() == "content-type"), "")
                if "json" in ct or (body and body.strip().startswith("{")):
                    body_type = "json"
                elif "xml" in ct:
                    body_type = "xml"
                elif "x-www-form-urlencoded" in ct:
                    body_type = "x-www-form-urlencoded"
                else:
                    body_type = "text"
        elif arg in ("-u", "--user"):
            i += 1
            if i < len(parts):
                cred = parts[i]
                if ":" in cred:
                    username, password = cred.split(":", 1)
                    auth_type = "basic"
                    auth_config = {"username": username, "password": password}
        elif arg in ("-F", "--form"):
            i += 1
            if i < len(parts):
                body_type = "form-data"
                if method == "GET":
                    method = "POST"
        elif arg in ("-L", "--location"):
            pass  # follow redirects, ignore
        elif arg in ("-k", "--insecure"):
            pass  # ignore
        elif arg in ("-o", "--output", "-O", "--remote-name"):
            i += 1  # skip output file
        elif arg in ("-s", "--silent", "-S", "--show-error", "-v", "--verbose", "-i", "--include"):
            pass  # ignore flags
        elif not arg.startswith("-"):
            url = arg
        i += 1

    # Extract query params from URL
    if "?" in url:
        base_url, qs = url.split("?", 1)
        url = base_url
        for pair in qs.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                query_params[k] = v

    # Check for bearer token in headers
    auth_header = headers.pop("Authorization", headers.pop("authorization", ""))
    if auth_header:
        if auth_header.lower().startswith("bearer "):
            auth_type = "bearer"
            auth_config = {"token": auth_header[7:]}
        elif auth_header.lower().startswith("basic "):
            import base64
            try:
                decoded = base64.b64decode(auth_header[6:]).decode()
                username, password = decoded.split(":", 1)
                auth_type = "basic"
                auth_config = {"username": username, "password": password}
            except Exception:
                pass

    return {
        "method": method,
        "url": url,
        "headers": headers,
        "body": body,
        "body_type": body_type,
        "auth_type": auth_type,
        "auth_config": auth_config,
        "query_params": query_params,
    }


def generate_curl(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    """Generate a cURL command from request parameters."""
    parts = ["curl"]

    if method != "GET":
        parts.append(f"-X {method}")

    # Build URL with query params
    full_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_url = f"{url}?{qs}"
    parts.append(f"'{full_url}'")

    # Auth
    if auth_type == "bearer" and auth_config:
        parts.append(f"-H 'Authorization: Bearer {auth_config.get('token', '')}'")
    elif auth_type == "basic" and auth_config:
        parts.append(f"-u '{auth_config.get('username', '')}:{auth_config.get('password', '')}'")
    elif auth_type == "api_key" and auth_config:
        placement = auth_config.get("placement", "header")
        if placement == "header":
            parts.append(f"-H '{auth_config.get('key', 'X-API-Key')}: {auth_config.get('value', '')}'")

    # Headers
    if headers:
        for k, v in headers.items():
            parts.append(f"-H '{k}: {v}'")

    # Body
    if body:
        escaped_body = body.replace("'", "'\\''")
        parts.append(f"-d '{escaped_body}'")

    return " \\\n  ".join(parts)


# ────────────────────────────────────────────────────────────
# Postman Collection v1 (Legacy) Parser
# ────────────────────────────────────────────────────────────

def _is_postman_v1(data: dict) -> bool:
    """Detect Postman Collection v1 format (pre-2016).

    v1 has top-level 'requests' array and no 'info' object.
    v2/v2.1 has 'info' with schema and 'item' array.
    """
    if "info" in data and "item" in data:
        return False
    if "requests" in data:
        return True
    return False


def _parse_v1_headers(headers_str: str) -> dict[str, str]:
    """Parse Postman v1 header string ('Key: Value\\nKey2: Value2') into dict."""
    result: dict[str, str] = {}
    if not headers_str or not headers_str.strip():
        return result
    for line in headers_str.strip().split("\n"):
        line = line.strip()
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip()
    return result


def _parse_v1_request(req: dict) -> dict[str, Any]:
    """Parse a single Postman v1 request into our standard format."""
    method = req.get("method", "GET").upper()
    url = req.get("url", "")
    name = req.get("name", "Request")
    description = req.get("description", "")

    # Parse headers from string format
    headers = _parse_v1_headers(req.get("headers", ""))

    # Parse body and query params based on dataMode
    data_mode = req.get("dataMode", "params")
    body: str | None = None
    body_type = "none"
    query_params: dict[str, str] = {}

    if data_mode == "raw":
        # Raw body mode
        raw_data = req.get("rawModeData", "")
        if raw_data:
            body = raw_data
            # Detect body type from content-type header
            ct = next(
                (v for k, v in headers.items() if k.lower() == "content-type"),
                "",
            ).lower()
            if "json" in ct or (raw_data.strip().startswith("{") or raw_data.strip().startswith("[")):
                body_type = "json"
            elif "xml" in ct:
                body_type = "xml"
            elif "x-www-form-urlencoded" in ct:
                body_type = "x-www-form-urlencoded"
            else:
                body_type = "text"
    elif data_mode == "params":
        # Query params or form data in 'data' array
        data_items = req.get("data", [])
        if data_items and method in ("POST", "PUT", "PATCH"):
            # Form data for non-GET methods
            obj = {}
            for item in data_items:
                key = item.get("key", "")
                if key and item.get("enabled", True) is not False:
                    obj[key] = item.get("value", "")
            if obj:
                body = json.dumps(obj)
                body_type = "x-www-form-urlencoded"
        else:
            # Query params for GET (already in URL for v1, but extract from data too)
            for item in data_items:
                key = item.get("key", "")
                if key and item.get("enabled", True) is not False:
                    query_params[key] = item.get("value", "")
    elif data_mode == "urlencoded":
        data_items = req.get("data", [])
        obj = {}
        for item in data_items:
            key = item.get("key", "")
            if key and item.get("enabled", True) is not False:
                obj[key] = item.get("value", "")
        if obj:
            body = json.dumps(obj)
            body_type = "x-www-form-urlencoded"
    elif data_mode == "binary":
        # Binary mode - we can't import the actual binary, just note it
        body = None
        body_type = "none"

    # Scripts - v1 has them directly on the request
    pre_request_script = req.get("preRequestScript", "") or ""
    post_response_script = req.get("tests", "") or ""

    return {
        "type": "request",
        "name": name,
        "method": method,
        "url": url,
        "headers": headers,
        "body": body,
        "body_type": body_type,
        "auth_type": "none",
        "auth_config": {},
        "query_params": query_params,
        "pre_request_script": pre_request_script.strip(),
        "post_response_script": post_response_script.strip(),
    }


def _parse_postman_v1(data: dict) -> dict[str, Any]:
    """Parse a Postman Collection v1 (legacy) JSON."""
    collection_name = data.get("name", "Imported Collection")
    description = data.get("description", "")

    # Build request lookup by ID
    requests_list = data.get("requests", [])
    requests_by_id: dict[str, dict] = {}
    for req in requests_list:
        req_id = req.get("id", "")
        if req_id:
            requests_by_id[req_id] = req

    # Track which request IDs have been placed in folders
    placed_ids: set[str] = set()

    items: list[dict] = []

    # Process folders first
    folders = data.get("folders", [])
    for folder in folders:
        folder_name = folder.get("name", "Folder")
        folder_order = folder.get("order", [])
        children: list[dict] = []
        for req_id in folder_order:
            req = requests_by_id.get(req_id)
            if req:
                children.append(_parse_v1_request(req))
                placed_ids.add(req_id)
        # Also check for sub-folders (v1 sometimes has nested folders_order)
        items.append({
            "type": "folder",
            "name": folder_name,
            "children": children,
        })

    # Process top-level ordered requests (not in any folder)
    top_order = data.get("order", [])
    for req_id in top_order:
        if req_id not in placed_ids:
            req = requests_by_id.get(req_id)
            if req:
                items.append(_parse_v1_request(req))
                placed_ids.add(req_id)

    # Any remaining requests not referenced in order or folders
    for req_id, req in requests_by_id.items():
        if req_id not in placed_ids:
            items.append(_parse_v1_request(req))

    return {
        "name": collection_name,
        "description": description,
        "items": items,
        "variables": [],
        "scripts": {"pre_request": "", "post_response": ""},
    }


# ────────────────────────────────────────────────────────────
# Postman Collection v2.1 Parser
# ────────────────────────────────────────────────────────────

def _parse_postman_auth(auth_data: dict | None) -> tuple[str, dict]:
    """Parse Postman auth configuration."""
    if not auth_data:
        return "none", {}

    auth_type = auth_data.get("type", "noauth")

    if auth_type == "bearer":
        bearer = auth_data.get("bearer", [])
        token = ""
        for item in bearer:
            if item.get("key") == "token":
                token = item.get("value", "")
        return "bearer", {"token": token}

    if auth_type == "basic":
        basic = auth_data.get("basic", [])
        username = ""
        password = ""
        for item in basic:
            if item.get("key") == "username":
                username = item.get("value", "")
            elif item.get("key") == "password":
                password = item.get("value", "")
        return "basic", {"username": username, "password": password}

    if auth_type == "apikey":
        apikey = auth_data.get("apikey", [])
        key_name = "X-API-Key"
        key_value = ""
        placement = "header"
        for item in apikey:
            if item.get("key") == "key":
                key_name = item.get("value", "X-API-Key")
            elif item.get("key") == "value":
                key_value = item.get("value", "")
            elif item.get("key") == "in":
                placement = item.get("value", "header")
        return "api_key", {"key": key_name, "value": key_value, "placement": placement}

    if auth_type == "oauth2":
        oauth2 = auth_data.get("oauth2", [])
        config: dict[str, str] = {}
        for item in oauth2:
            config[item.get("key", "")] = str(item.get("value", ""))
        return "oauth2", config

    return "none", {}


def _parse_postman_body(body_data: dict | None) -> tuple[str | None, str]:
    """Parse Postman request body."""
    if not body_data:
        return None, "none"

    mode = body_data.get("mode", "raw")

    if mode == "raw":
        raw = body_data.get("raw", "")
        options = body_data.get("options", {})
        lang = options.get("raw", {}).get("language", "json")
        body_type_map = {"json": "json", "xml": "xml", "text": "text", "javascript": "json"}
        return raw, body_type_map.get(lang, "text")

    if mode == "formdata":
        form = body_data.get("formdata", [])
        obj = {item["key"]: item.get("value", "") for item in form if item.get("key")}
        return json.dumps(obj), "form-data"

    if mode == "urlencoded":
        encoded = body_data.get("urlencoded", [])
        obj = {item["key"]: item.get("value", "") for item in encoded if item.get("key")}
        return json.dumps(obj), "x-www-form-urlencoded"

    return None, "none"


def _parse_item_scripts(item: dict) -> tuple[str, str]:
    """Extract pre-request and post-response scripts from a Postman item's event array."""
    pre_request = ""
    post_response = ""
    for event in item.get("event", []):
        listen = event.get("listen", "")
        script_data = event.get("script", {})
        exec_lines = script_data.get("exec", [])
        script_text = "\n".join(exec_lines).strip()
        if listen == "prerequest" and script_text:
            pre_request = script_text
        elif listen == "test" and script_text:
            post_response = script_text
    return pre_request, post_response


def _parse_postman_items(items: list[dict], collection_name: str) -> list[dict]:
    """Recursively parse Postman collection items."""
    result: list[dict] = []

    for item in items:
        if "item" in item:
            # It's a folder
            folder = {
                "type": "folder",
                "name": item.get("name", "Folder"),
                "children": _parse_postman_items(item["item"], collection_name),
            }
            result.append(folder)
        elif "request" in item:
            req_data = item["request"]
            if isinstance(req_data, str):
                # Simple URL string
                result.append({
                    "type": "request",
                    "name": item.get("name", "Request"),
                    "method": "GET",
                    "url": req_data,
                    "headers": {},
                    "body": None,
                    "body_type": "none",
                    "auth_type": "none",
                    "auth_config": {},
                    "query_params": {},
                    "pre_request_script": "",
                    "post_response_script": "",
                })
                continue

            # Parse URL
            url_data = req_data.get("url", {})
            if isinstance(url_data, str):
                url = url_data
                qp = {}
            else:
                raw_url = url_data.get("raw", "")
                url = raw_url
                qp = {}
                for q in url_data.get("query", []):
                    if q.get("key"):
                        qp[q["key"]] = q.get("value", "")

            # Parse headers
            headers = {}
            for h in req_data.get("header", []):
                if h.get("key") and not h.get("disabled", False):
                    headers[h["key"]] = h.get("value", "")

            # Parse body
            body, body_type = _parse_postman_body(req_data.get("body"))

            # Parse auth
            auth_type, auth_config = _parse_postman_auth(req_data.get("auth"))

            # Parse scripts
            pre_req_script, post_res_script = _parse_item_scripts(item)

            result.append({
                "type": "request",
                "name": item.get("name", "Request"),
                "method": req_data.get("method", "GET"),
                "url": url,
                "headers": headers,
                "body": body,
                "body_type": body_type,
                "auth_type": auth_type,
                "auth_config": auth_config,
                "query_params": qp,
                "pre_request_script": pre_req_script,
                "post_response_script": post_res_script,
            })

    return result


def parse_postman_collection(data: dict) -> dict[str, Any]:
    """Parse a Postman Collection (v1 or v2.1) JSON.

    Automatically detects the version and delegates to the appropriate parser.
    """
    if _is_postman_v1(data):
        return _parse_postman_v1(data)

    # v2 / v2.1
    info = data.get("info", {})
    collection_name = info.get("name", "Imported Collection")

    items = _parse_postman_items(data.get("item", []), collection_name)
    collection_variables = extract_collection_variables(data)
    collection_scripts = extract_collection_scripts(data)

    return {
        "name": collection_name,
        "description": info.get("description", ""),
        "items": items,
        "variables": collection_variables,
        "scripts": collection_scripts,
    }


# ────────────────────────────────────────────────────────────
# Postman Environment / Globals Parser
# ────────────────────────────────────────────────────────────

_SECRET_PATTERNS = ("password", "pwd", "secret", "token", "apikey", "api_key")


def parse_postman_environment(data: dict) -> dict[str, Any]:
    """Parse a Postman environment or globals JSON file."""
    name = data.get("name", "Imported Environment")
    scope = data.get("_postman_variable_scope", "environment")

    variables: list[dict[str, Any]] = []
    for v in data.get("values", []):
        key = v.get("key", "")
        if not key:
            continue
        if not v.get("enabled", True):
            continue
        is_secret = v.get("type") == "secret" or any(
            p in key.lower() for p in _SECRET_PATTERNS
        )
        variables.append({
            "key": key,
            "value": v.get("value", ""),
            "is_secret": is_secret,
        })

    return {
        "name": name,
        "scope": scope,
        "variables": variables,
        "original_id": data.get("id", ""),
    }


def extract_collection_variables(data: dict) -> list[dict[str, Any]]:
    """Extract collection-level variables from a Postman collection."""
    result: list[dict[str, Any]] = []
    for v in data.get("variable", []):
        key = v.get("key", "")
        if not key:
            continue
        result.append({
            "key": key,
            "value": v.get("value", ""),
            "is_secret": any(p in key.lower() for p in _SECRET_PATTERNS),
        })
    return result


def extract_collection_scripts(data: dict) -> dict[str, str]:
    """Extract collection-level pre-request and test scripts."""
    pre_request, post_response = _parse_item_scripts(data)
    return {"pre_request": pre_request, "post_response": post_response}


def _extract_variable_references(items: list[dict]) -> set[str]:
    """Recursively scan parsed items for {{variable}} references."""
    refs: set[str] = set()
    var_pattern = re.compile(r"\{\{(\w+)\}\}")
    for item in items:
        if item.get("type") == "folder":
            refs |= _extract_variable_references(item.get("children", []))
        else:
            for field in ("url", "body"):
                val = item.get(field) or ""
                refs |= set(var_pattern.findall(val))
            for hv in (item.get("headers") or {}).values():
                refs |= set(var_pattern.findall(str(hv)))
            for qv in (item.get("query_params") or {}).values():
                refs |= set(var_pattern.findall(str(qv)))
    return refs


# ────────────────────────────────────────────────────────────
# OpenAPI / Swagger Parser
# ────────────────────────────────────────────────────────────

def _resolve_ref(spec: dict, ref: str) -> dict:
    """Resolve a $ref pointer in OpenAPI spec."""
    parts = ref.lstrip("#/").split("/")
    current = spec
    for part in parts:
        current = current.get(part, {})
    return current


def _generate_example_from_schema(spec: dict, schema: dict, depth: int = 0) -> Any:
    """Generate example value from an OpenAPI schema."""
    if depth > 5:
        return None

    if "$ref" in schema:
        schema = _resolve_ref(spec, schema["$ref"])

    if "example" in schema:
        return schema["example"]

    schema_type = schema.get("type", "object")

    if schema_type == "string":
        fmt = schema.get("format", "")
        if fmt == "email":
            return "user@example.com"
        if fmt == "date-time":
            return "2024-01-01T00:00:00Z"
        if fmt == "date":
            return "2024-01-01"
        if fmt == "uri":
            return "https://example.com"
        if fmt == "uuid":
            return "550e8400-e29b-41d4-a716-446655440000"
        enum = schema.get("enum")
        if enum:
            return enum[0]
        return "string"

    if schema_type == "integer":
        return 0
    if schema_type == "number":
        return 0.0
    if schema_type == "boolean":
        return True

    if schema_type == "array":
        items_schema = schema.get("items", {})
        return [_generate_example_from_schema(spec, items_schema, depth + 1)]

    if schema_type == "object":
        props = schema.get("properties", {})
        result = {}
        for prop_name, prop_schema in props.items():
            result[prop_name] = _generate_example_from_schema(spec, prop_schema, depth + 1)
        return result

    return None


def parse_openapi(raw_content: str) -> dict[str, Any]:
    """Parse an OpenAPI/Swagger spec (JSON or YAML)."""
    # Try JSON first, then YAML
    try:
        spec = json.loads(raw_content)
    except json.JSONDecodeError:
        try:
            spec = yaml.safe_load(raw_content)
        except Exception:
            raise ValueError("Could not parse as JSON or YAML")

    if not isinstance(spec, dict):
        raise ValueError("Invalid OpenAPI spec")

    # Determine version
    is_swagger = spec.get("swagger", "").startswith("2.")
    is_openapi3 = spec.get("openapi", "").startswith("3.")

    if not is_swagger and not is_openapi3:
        raise ValueError("Not a valid OpenAPI/Swagger specification")

    title = spec.get("info", {}).get("title", "Imported API")
    description = spec.get("info", {}).get("description", "")

    # Determine base URL
    base_url = ""
    if is_swagger:
        host = spec.get("host", "localhost")
        base_path = spec.get("basePath", "")
        schemes = spec.get("schemes", ["https"])
        scheme = schemes[0] if schemes else "https"
        base_url = f"{scheme}://{host}{base_path}"
    elif is_openapi3:
        servers = spec.get("servers", [])
        if servers:
            base_url = servers[0].get("url", "")

    # Parse paths
    folders: dict[str, list[dict]] = {}
    paths = spec.get("paths", {})

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue

        for http_method in ["get", "post", "put", "patch", "delete", "head", "options"]:
            operation = path_item.get(http_method)
            if not operation:
                continue

            op_id = operation.get("operationId", f"{http_method.upper()} {path}")
            summary = operation.get("summary", op_id)
            tags = operation.get("tags", ["Default"])
            tag = tags[0] if tags else "Default"

            # Build URL
            full_url = f"{base_url}{path}" if base_url else path

            # Parse parameters
            headers: dict[str, str] = {}
            query_params: dict[str, str] = {}
            all_params = path_item.get("parameters", []) + operation.get("parameters", [])

            for param in all_params:
                if "$ref" in param:
                    param = _resolve_ref(spec, param["$ref"])

                param_in = param.get("in", "")
                param_name = param.get("name", "")
                example = param.get("example", param.get("schema", {}).get("example", ""))

                if param_in == "query":
                    query_params[param_name] = str(example) if example else ""
                elif param_in == "header":
                    headers[param_name] = str(example) if example else ""

            # Parse request body
            body = None
            body_type = "none"

            if is_openapi3:
                req_body = operation.get("requestBody", {})
                content = req_body.get("content", {})
                if "application/json" in content:
                    schema = content["application/json"].get("schema", {})
                    example = content["application/json"].get("example")
                    if not example:
                        example = _generate_example_from_schema(spec, schema)
                    if example:
                        body = json.dumps(example, indent=2)
                        body_type = "json"
                elif "application/xml" in content:
                    body_type = "xml"
                elif "application/x-www-form-urlencoded" in content:
                    schema = content["application/x-www-form-urlencoded"].get("schema", {})
                    example = _generate_example_from_schema(spec, schema)
                    if example:
                        body = json.dumps(example, indent=2)
                        body_type = "x-www-form-urlencoded"
            elif is_swagger:
                for param in all_params:
                    if param.get("in") == "body":
                        schema = param.get("schema", {})
                        example = _generate_example_from_schema(spec, schema)
                        if example:
                            body = json.dumps(example, indent=2)
                            body_type = "json"

            request_data = {
                "type": "request",
                "name": summary,
                "method": http_method.upper(),
                "url": full_url,
                "headers": headers,
                "body": body,
                "body_type": body_type,
                "auth_type": "none",
                "auth_config": {},
                "query_params": query_params,
            }

            if tag not in folders:
                folders[tag] = []
            folders[tag].append(request_data)

    # Build items structure
    items: list[dict] = []
    for folder_name, requests in folders.items():
        if len(folders) == 1 and folder_name == "Default":
            items.extend(requests)
        else:
            items.append({
                "type": "folder",
                "name": folder_name,
                "children": requests,
            })

    return {
        "name": title,
        "description": description,
        "items": items,
    }


# ────────────────────────────────────────────────────────────
# Postman Export
# ────────────────────────────────────────────────────────────

def _build_postman_auth(auth_type: str, auth_config: dict | None) -> dict | None:
    """Build Postman auth object."""
    if auth_type == "none" or not auth_config:
        return None

    if auth_type == "bearer":
        return {
            "type": "bearer",
            "bearer": [{"key": "token", "value": auth_config.get("token", ""), "type": "string"}],
        }

    if auth_type == "basic":
        return {
            "type": "basic",
            "basic": [
                {"key": "username", "value": auth_config.get("username", ""), "type": "string"},
                {"key": "password", "value": auth_config.get("password", ""), "type": "string"},
            ],
        }

    if auth_type == "api_key":
        return {
            "type": "apikey",
            "apikey": [
                {"key": "key", "value": auth_config.get("key", ""), "type": "string"},
                {"key": "value", "value": auth_config.get("value", ""), "type": "string"},
                {"key": "in", "value": auth_config.get("placement", "header"), "type": "string"},
            ],
        }

    return None


def export_to_postman(
    collection_name: str,
    collection_desc: str,
    items: list[dict],
    variables: dict[str, str] | None = None,
) -> dict:
    """Export collection to Postman Collection v2.1 format."""

    def build_item(item: dict) -> dict:
        if item.get("is_folder"):
            return {
                "name": item["name"],
                "item": [build_item(child) for child in item.get("children", [])],
            }

        req = item.get("request", item)
        url = req.get("url", "")
        headers_list = [{"key": k, "value": v} for k, v in (req.get("headers") or {}).items()]
        query_list = [{"key": k, "value": v} for k, v in (req.get("query_params") or {}).items()]

        postman_url: dict[str, Any] = {"raw": url}

        # Parse URL into Postman components (helps Postman UI populate fields)
        parsed = urlparse(url) if isinstance(url, str) else None
        if parsed and parsed.scheme and parsed.netloc:
            postman_url["protocol"] = parsed.scheme
            postman_url["host"] = parsed.netloc.split(".")
            if parsed.path:
                postman_url["path"] = [p for p in parsed.path.split("/") if p]
        elif parsed and parsed.path:
            # Relative path only
            postman_url["path"] = [p for p in parsed.path.split("/") if p]

        # Prefer explicit query params; fall back to URL query if needed
        if query_list:
            postman_url["query"] = query_list
        elif parsed and parsed.query:
            postman_url["query"] = [{"key": k, "value": v} for k, v in parse_qsl(parsed.query, keep_blank_values=True)]

        body_data = None
        if req.get("body"):
            bt = req.get("body_type", "json")
            if bt in ("json", "xml", "text"):
                body_data = {
                    "mode": "raw",
                    "raw": req["body"],
                    "options": {"raw": {"language": bt}},
                }
            elif bt == "form-data":
                body_data = {"mode": "formdata", "formdata": []}
            elif bt == "x-www-form-urlencoded":
                body_data = {"mode": "urlencoded", "urlencoded": []}

        postman_item: dict[str, Any] = {
            "name": item.get("name", "Request"),
            "request": {
                "method": req.get("method", "GET"),
                "header": headers_list,
                "url": postman_url,
            },
        }

        if body_data:
            postman_item["request"]["body"] = body_data

        auth = _build_postman_auth(req.get("auth_type", "none"), req.get("auth_config"))
        if auth:
            postman_item["request"]["auth"] = auth

        return postman_item

    postman: dict[str, Any] = {
        "info": {
            "_postman_id": str(uuid.uuid4()),
            "name": collection_name,
            "description": collection_desc or "",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": [build_item(item) for item in items],
    }
    if variables:
        postman["variable"] = [
            {"key": k, "value": v, "type": "string"}
            for k, v in variables.items()
            if k
        ]
    return postman
