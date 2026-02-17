"""
AI-powered API documentation generator.

Uses pre-built HTML templates. The AI only generates descriptions/documentation
text as JSON — the template renders everything. This is much faster and
eliminates hallucination of HTML structure.
"""

import base64
import io
import json
import logging
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import AsyncGenerator

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.models.collection import Collection, CollectionItem
from app.models.request import Request
from app.services.ai_generator import AIProviderConfig, OLLAMA_DEFAULT_NUM_CTX
from app.services.code_generator import generate_code, LANGUAGE_LABELS

logger = logging.getLogger(__name__)

DOC_LANGUAGES = {
    "en": "English",
    "hu": "Hungarian",
    "de": "German",
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
    "it": "Italian",
    "ja": "Japanese",
    "zh": "Chinese",
    "ko": "Korean",
}

SDK_FILE_EXTENSIONS = {
    "curl": "sh",
    "python": "py",
    "javascript_fetch": "js",
    "javascript_axios": "js",
    "go": "go",
    "java": "java",
    "csharp": "cs",
    "php": "php",
}


@dataclass
class RequestDoc:
    name: str
    method: str
    url: str
    headers: dict | None
    body: str | None
    body_type: str | None
    auth_type: str
    auth_config: dict | None
    query_params: dict | None
    protocol: str
    folder_path: str
    description: str | None
    form_data: list | None = None


@dataclass
class DocRequest:
    collection_id: str
    folder_id: str | None = None
    doc_language: str = "en"
    use_ai: bool = False
    extra_prompt: str | None = None
    include_sdk: bool = False
    sdk_languages: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# AI prompt — only asks for JSON descriptions, NOT HTML
# ---------------------------------------------------------------------------

AI_ENRICHMENT_PROMPT = """You are an expert API documentation writer.

I will give you a list of API endpoints with their method, URL, parameters, headers, and body schema.

YOUR TASK: For each endpoint, write:
1. A clear, professional **description** (1-3 sentences) explaining what it does.
2. For each **header**, **query parameter**, and **body field** — a short description of what it's for.

OUTPUT FORMAT: Return ONLY a valid JSON object. No markdown, no code fences, no explanation.

```
{{
  "collection_description": "A brief overview of this API collection (2-3 sentences)",
  "endpoints": {{
    "0": {{
      "description": "What this endpoint does",
      "headers": {{ "Content-Type": "The media type of the request body" }},
      "query_params": {{ "page": "Page number for pagination" }},
      "body_fields": {{ "name": "The user's display name", "email": "Email address for account" }},
      "notes": "Any additional notes about usage or gotchas"
    }},
    "1": {{ ... }}
  }}
}}
```

RULES:
- Use endpoint INDEX (starting from 0) as the key, matching the order I give you.
- Write ALL text in **{language}**.
- Do NOT invent endpoints. Only describe the ones listed.
- Keep descriptions concise and professional.
- For nested body fields, use dot notation: "address.street", "items[].name"
{extra_instructions}
"""


def _collect_requests_with_structure(
    db: Session,
    collection_id: str,
    parent_id: str | None,
    path_prefix: str = "",
) -> list[RequestDoc]:
    """DFS traversal collecting requests with their folder path."""
    items = (
        db.query(CollectionItem)
        .filter(
            CollectionItem.collection_id == collection_id,
            CollectionItem.parent_id == parent_id,
        )
        .order_by(CollectionItem.sort_order)
        .all()
    )

    result: list[RequestDoc] = []
    for item in items:
        if item.is_folder:
            folder_path = item.name if not path_prefix else f"{path_prefix}/{item.name}"
            result.extend(
                _collect_requests_with_structure(db, collection_id, item.id, folder_path)
            )
        elif item.request_id:
            req = db.query(Request).filter(Request.id == item.request_id).first()
            if req:
                method_val = req.method.value if hasattr(req.method, "value") else str(req.method)
                auth_val = req.auth_type.value if hasattr(req.auth_type, "value") else str(req.auth_type or "none")
                result.append(
                    RequestDoc(
                        name=req.name,
                        method=method_val,
                        url=req.url,
                        headers=req.headers,
                        body=req.body,
                        body_type=req.body_type,
                        auth_type=auth_val,
                        auth_config=req.auth_config,
                        query_params=req.query_params,
                        protocol=req.protocol or "http",
                        folder_path=path_prefix,
                        description=item.description,
                        form_data=req.form_data,
                    )
                )
    return result


# ---------------------------------------------------------------------------
# Body / schema helpers
# ---------------------------------------------------------------------------

def _schema_from_value(val: object) -> object:
    """Recursively extract JSON schema structure — types only, no actual values."""
    if isinstance(val, dict):
        return {k: _schema_from_value(v) for k, v in val.items()}
    elif isinstance(val, list):
        if len(val) > 0:
            return [_schema_from_value(val[0])]
        return []
    elif isinstance(val, str):
        return "string"
    elif isinstance(val, bool):
        return "boolean"
    elif isinstance(val, int):
        return "integer"
    elif isinstance(val, float):
        return "number"
    elif val is None:
        return "null"
    return "unknown"


def _extract_body_schema(body: str | None, body_type: str | None, form_data: list | None = None) -> dict | list | str | None:
    """Extract structure from body — returns dict/list for JSON, string for others."""
    if body_type in ("form-data", "x-www-form-urlencoded"):
        # Try form_data array first, then body
        source = form_data or []
        if not source and body:
            try:
                source = json.loads(body)
            except (json.JSONDecodeError, TypeError):
                source = []
        if isinstance(source, list):
            fields = {}
            for item in source:
                if isinstance(item, dict):
                    fields[item.get("key", "?")] = item.get("type", "text")
            return fields if fields else None
        return None

    if body and body_type == "json":
        try:
            parsed = json.loads(body)
            return _schema_from_value(parsed)
        except (json.JSONDecodeError, TypeError):
            return None

    if body and body_type == "graphql":
        return body[:2000]

    if body and body_type == "xml":
        tags = re.findall(r"<(\w+)[\s>]", body)
        unique_tags = list(dict.fromkeys(tags))
        return {"xml_tags": unique_tags[:30]}

    if body and body_type == "text":
        return f"plain text ({len(body)} chars)"

    return None


# ---------------------------------------------------------------------------
# Build structured endpoint data for template
# ---------------------------------------------------------------------------

def _build_endpoint_data(
    requests_list: list[RequestDoc],
    ai_descriptions: dict | None = None,
    sdk_snippets: dict | None = None,
) -> list[dict]:
    """Build the JSON data array that the HTML template will render."""
    endpoints = []
    for i, req in enumerate(requests_list):
        ai_ep = {}
        if ai_descriptions and "endpoints" in ai_descriptions:
            ai_ep = ai_descriptions["endpoints"].get(str(i), {})

        # Headers — keys only, no secret values
        headers_list = []
        if req.headers:
            for k, v in req.headers.items():
                is_sensitive = k.lower() in ("authorization", "x-api-key", "cookie", "set-cookie")
                headers_list.append({
                    "name": k,
                    "type": "string",
                    "description": ai_ep.get("headers", {}).get(k, ""),
                    "sensitive": is_sensitive,
                })

        # Query params
        params_list = []
        if req.query_params:
            for k, v in req.query_params.items():
                params_list.append({
                    "name": k,
                    "type": type(v).__name__,
                    "description": ai_ep.get("query_params", {}).get(k, ""),
                })

        # Body schema
        body_schema = _extract_body_schema(req.body, req.body_type, req.form_data)

        # Flatten body fields for description matching
        body_fields_desc = ai_ep.get("body_fields", {})

        # Auth
        auth_info = None
        if req.auth_type and req.auth_type != "none":
            auth_info = {
                "type": req.auth_type,
                "config_keys": list(req.auth_config.keys()) if req.auth_config else [],
            }

        # SDK code
        sdk = {}
        if sdk_snippets:
            safe_name = req.name.replace("/", "_").replace("\\", "_").replace(" ", "_")
            for lang, snippets in sdk_snippets.items():
                if safe_name in snippets:
                    sdk[LANGUAGE_LABELS.get(lang, lang)] = snippets[safe_name]

        ep = {
            "index": i,
            "name": req.name,
            "method": req.method,
            "url": req.url,
            "protocol": req.protocol,
            "folder": req.folder_path or "",
            "description": ai_ep.get("description", req.description or ""),
            "notes": ai_ep.get("notes", ""),
            "headers": headers_list,
            "query_params": params_list,
            "body_type": req.body_type,
            "body_schema": body_schema,
            "body_fields_desc": body_fields_desc,
            "auth": auth_info,
            "sdk": sdk,
        }
        endpoints.append(ep)

    return endpoints


# ---------------------------------------------------------------------------
# Serialize for AI (compact, keys-only)
# ---------------------------------------------------------------------------

def _serialize_for_ai(requests_list: list[RequestDoc]) -> str:
    """Compact serialization for AI — just enough info to write descriptions."""
    lines = []
    for i, req in enumerate(requests_list):
        parts = [f"[{i}] {req.method} {req.url} — \"{req.name}\""]
        if req.protocol != "http":
            parts[0] += f" ({req.protocol})"
        if req.folder_path:
            parts.append(f"  Folder: {req.folder_path}")
        if req.headers:
            hdr_keys = [k for k in req.headers.keys() if k.lower() not in ("authorization", "x-api-key", "cookie")]
            if hdr_keys:
                parts.append(f"  Headers: {', '.join(hdr_keys)}")
        if req.query_params:
            parts.append(f"  Params: {', '.join(req.query_params.keys())}")
        schema = _extract_body_schema(req.body, req.body_type, req.form_data)
        if schema and isinstance(schema, dict):
            parts.append(f"  Body keys: {', '.join(str(k) for k in schema.keys())}")
        elif schema and isinstance(schema, str) and len(schema) < 200:
            parts.append(f"  Body: {schema}")
        if req.auth_type and req.auth_type != "none":
            parts.append(f"  Auth: {req.auth_type}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# SDK snippet generation (deterministic, no AI)
# ---------------------------------------------------------------------------

def _generate_sdk_snippets(
    requests_list: list[RequestDoc],
    sdk_languages: list[str],
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for lang in sdk_languages:
        result[lang] = {}
        for req in requests_list:
            if req.protocol != "http":
                continue
            try:
                code = generate_code(
                    language=lang,
                    method=req.method,
                    url=req.url,
                    headers=req.headers,
                    body=req.body,
                    body_type=req.body_type or "none",
                    query_params=req.query_params,
                    auth_type=req.auth_type,
                    auth_config=req.auth_config,
                )
                safe_name = req.name.replace("/", "_").replace("\\", "_").replace(" ", "_")
                result[lang][safe_name] = code
            except Exception as exc:
                logger.debug("SDK gen failed for %s/%s: %s", lang, req.name, exc)
    return result


def _create_zip_bundle(
    html_content: str,
    collection_name: str,
    sdk_snippets: dict[str, dict[str, str]],
) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("documentation.html", html_content)
        for lang, snippets in sdk_snippets.items():
            ext = SDK_FILE_EXTENSIONS.get(lang, "txt")
            lang_label = LANGUAGE_LABELS.get(lang, lang)
            for req_name, code in snippets.items():
                zf.writestr(f"sdk/{lang_label}/{req_name}.{ext}", code)
    return buffer.getvalue()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# HTML Template
# ---------------------------------------------------------------------------

def _build_html(
    collection_name: str,
    collection_description: str,
    ai_collection_desc: str,
    endpoints: list[dict],
    doc_language: str,
    has_sdk: bool,
) -> str:
    """Build complete HTML from template + data. No AI needed for structure."""
    data_json = json.dumps({
        "collection": {
            "name": collection_name,
            "description": collection_description or "",
            "ai_description": ai_collection_desc,
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "endpoint_count": len(endpoints),
        },
        "endpoints": endpoints,
        "has_sdk": has_sdk,
        "lang": doc_language,
    }, ensure_ascii=False)

    return HTML_TEMPLATE.replace("__API_DATA_PLACEHOLDER__", data_json)


# ---------------------------------------------------------------------------
# Main streaming generator
# ---------------------------------------------------------------------------

async def generate_documentation_stream(
    db: Session,
    doc_req: DocRequest,
    config: AIProviderConfig | None,
) -> AsyncGenerator[str, None]:
    """Stream SSE events for documentation generation."""

    # 1. Collect requests
    yield _sse("progress", {"phase": "collecting"})

    collection = db.query(Collection).filter(Collection.id == doc_req.collection_id).first()
    if not collection:
        yield _sse("error", {"message": "Collection not found"})
        return

    requests_list = _collect_requests_with_structure(
        db, doc_req.collection_id, doc_req.folder_id
    )
    if not requests_list:
        yield _sse("error", {"message": "No requests found"})
        return

    yield _sse("progress", {"phase": "collected", "count": len(requests_list)})

    # 2. Generate SDK snippets if requested (deterministic, fast)
    sdk_snippets: dict[str, dict[str, str]] = {}
    if doc_req.include_sdk and doc_req.sdk_languages:
        yield _sse("progress", {"phase": "sdk"})
        sdk_snippets = _generate_sdk_snippets(requests_list, doc_req.sdk_languages)
        yield _sse("progress", {"phase": "sdk_done", "languages": len(sdk_snippets)})

    # 3. AI enrichment — only if use_ai is True and config is provided
    ai_descriptions: dict | None = None

    if doc_req.use_ai and config:
        yield _sse("progress", {"phase": "generating"})
        try:
            serialized = _serialize_for_ai(requests_list)
            language_name = DOC_LANGUAGES.get(doc_req.doc_language, "English")
            extra = f"\nAdditional instructions: {doc_req.extra_prompt}" if doc_req.extra_prompt else ""

            system = AI_ENRICHMENT_PROMPT.format(
                language=language_name,
                extra_instructions=extra,
            )

            user_msg = (
                f"Collection: {collection.name}\n"
                f"Description: {collection.description or 'N/A'}\n\n"
                f"Endpoints:\n\n{serialized}"
            )

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
                extra_kwargs["extra_body"] = {"options": {"num_ctx": OLLAMA_DEFAULT_NUM_CTX}}

            # Non-streaming — we need complete JSON
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.3,
                **extra_kwargs,
            )

            raw = response.choices[0].message.content or ""
            # Strip markdown code fences if present
            raw = raw.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?\s*\n?", "", raw)
                raw = re.sub(r"\n?```\s*$", "", raw)

            ai_descriptions = json.loads(raw)
            yield _sse("progress", {"phase": "ai_done"})

        except Exception as e:
            logger.warning("AI enrichment failed (continuing without): %s", e)
            yield _sse("progress", {"phase": "ai_fallback", "reason": str(e)})
            ai_descriptions = None

    # 4. Build endpoint data + render template
    yield _sse("progress", {"phase": "rendering"})

    endpoints = _build_endpoint_data(requests_list, ai_descriptions, sdk_snippets)
    ai_col_desc = ""
    if ai_descriptions:
        ai_col_desc = ai_descriptions.get("collection_description", "")

    html_content = _build_html(
        collection_name=collection.name,
        collection_description=collection.description or "",
        ai_collection_desc=ai_col_desc,
        endpoints=endpoints,
        doc_language=doc_req.doc_language,
        has_sdk=bool(sdk_snippets),
    )

    # Stream the HTML in chunks for preview
    chunk_size = 4096
    for i in range(0, len(html_content), chunk_size):
        yield _sse("chunk", {"text": html_content[i:i + chunk_size]})

    # 5. Return final result
    if doc_req.include_sdk and sdk_snippets:
        zip_bytes = _create_zip_bundle(html_content, collection.name, sdk_snippets)
        yield _sse("complete", {
            "type": "zip",
            "html": html_content,
            "zip_base64": base64.b64encode(zip_bytes).decode(),
            "filename": f"{collection.name}-docs.zip",
        })
    else:
        yield _sse("complete", {
            "type": "html",
            "html": html_content,
            "filename": f"{collection.name}-docs.html",
        })


# ---------------------------------------------------------------------------
# HTML TEMPLATE — professional, OpenReq branded, renders from JSON data
# ---------------------------------------------------------------------------

HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Documentation</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#ffffff;--bg2:#f8fafc;--bg3:#f1f5f9;--fg:#0f172a;--fg2:#475569;--fg3:#94a3b8;
  --border:#e2e8f0;--accent:#6366f1;--accent2:#818cf8;--accent-bg:rgba(99,102,241,.08);
  --card:#ffffff;--card-border:#e2e8f0;--code-bg:#f1f5f9;
  --get:#22c55e;--post:#eab308;--put:#3b82f6;--patch:#a855f7;--delete:#ef4444;--head:#6b7280;--options:#6b7280;
  --ws:#14b8a6;--gql:#e879f9;
  --sidebar-w:280px;--topbar-h:64px;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
[data-theme="dark"]{
  --bg:#0f172a;--bg2:#1e293b;--bg3:#334155;--fg:#f1f5f9;--fg2:#cbd5e1;--fg3:#64748b;
  --border:#334155;--accent:#818cf8;--accent2:#a5b4fc;--accent-bg:rgba(129,140,248,.12);
  --card:#1e293b;--card-border:#334155;--code-bg:#0f172a;
}
html{scroll-behavior:smooth}
body{font-family:var(--font);background:var(--bg);color:var(--fg);line-height:1.6;font-size:15px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

/* Sidebar */
.sidebar{position:fixed;top:0;left:0;width:var(--sidebar-w);height:100vh;background:var(--bg2);
  border-right:1px solid var(--border);overflow-y:auto;z-index:100;transition:transform .3s}
.sidebar-brand{padding:20px 20px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.sidebar-brand svg{flex-shrink:0}
.sidebar-brand h1{font-size:16px;font-weight:700;color:var(--accent)}
.sidebar-brand span{font-size:11px;color:var(--fg3);display:block;margin-top:2px}
.sidebar-nav{padding:12px 0}
.nav-group{margin-bottom:8px}
.nav-group-title{padding:6px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--fg3)}
.nav-item{display:flex;align-items:center;gap:8px;padding:6px 20px;font-size:13px;color:var(--fg2);
  cursor:pointer;transition:background .15s,color .15s;text-decoration:none}
.nav-item:hover{background:var(--accent-bg);color:var(--accent);text-decoration:none}
.method-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.protocol-badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;color:#fff;flex-shrink:0;text-transform:uppercase}

/* Main */
.main{margin-left:var(--sidebar-w);min-height:100vh}
.topbar{height:var(--topbar-h);border-bottom:1px solid var(--border);display:flex;align-items:center;
  justify-content:flex-end;padding:0 24px;gap:8px;background:var(--bg);position:sticky;top:0;z-index:50}
.theme-btn{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:6px 12px;
  cursor:pointer;color:var(--fg);font-size:13px;display:flex;align-items:center;gap:6px}
.theme-btn:hover{border-color:var(--accent)}
.content{max-width:960px;margin:0 auto;padding:32px 32px 80px}

/* Hero */
.hero{margin-bottom:48px;padding-bottom:32px;border-bottom:1px solid var(--border)}
.hero h1{font-size:28px;font-weight:800;margin-bottom:8px}
.hero .desc{color:var(--fg2);font-size:15px;margin-bottom:16px}
.hero-meta{display:flex;gap:16px;flex-wrap:wrap}
.meta-chip{background:var(--bg3);padding:4px 12px;border-radius:20px;font-size:12px;color:var(--fg2);font-weight:500}

/* Endpoint */
.endpoint{background:var(--card);border:1px solid var(--card-border);border-radius:12px;margin-bottom:24px;overflow:hidden}
.ep-header{padding:20px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.method-badge{padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.03em}
.ep-url{font-family:"SF Mono",Consolas,"Liberation Mono",Menlo,monospace;font-size:14px;color:var(--fg);word-break:break-all}
.ep-name{font-size:13px;color:var(--fg3);margin-left:auto}
.ep-body{padding:0 24px 20px}
.ep-desc{color:var(--fg2);font-size:14px;margin-bottom:16px;line-height:1.7}
.ep-notes{background:var(--accent-bg);border-left:3px solid var(--accent);padding:10px 14px;
  border-radius:0 8px 8px 0;font-size:13px;color:var(--fg2);margin-bottom:16px}
.section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--fg3);
  margin:16px 0 8px;display:flex;align-items:center;gap:6px}
.section-title::before{content:"";display:block;width:3px;height:14px;border-radius:2px;background:var(--accent)}

/* Tables */
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
th{text-align:left;padding:8px 12px;background:var(--bg3);color:var(--fg2);font-weight:600;font-size:12px;
  text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid var(--border)}
td{padding:8px 12px;border-bottom:1px solid var(--border);color:var(--fg)}
td code{background:var(--code-bg);padding:2px 6px;border-radius:4px;font-size:12px;font-family:"SF Mono",Consolas,monospace}
tr:last-child td{border-bottom:none}

/* Code */
.code-block{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;
  overflow-x:auto;font-family:"SF Mono",Consolas,monospace;font-size:13px;line-height:1.5;
  white-space:pre-wrap;word-break:break-all;position:relative;margin-bottom:12px}
.copy-btn{position:absolute;top:8px;right:8px;background:var(--bg3);border:1px solid var(--border);
  border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;color:var(--fg2)}
.copy-btn:hover{border-color:var(--accent);color:var(--accent)}

/* SDK Tabs */
.sdk-tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:0}
.sdk-tab{padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;color:var(--fg3);
  border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s}
.sdk-tab:hover{color:var(--fg)}
.sdk-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.sdk-panel{display:none}
.sdk-panel.active{display:block}

/* Auth badge */
.auth-badge{display:inline-flex;align-items:center;gap:4px;background:var(--accent-bg);
  color:var(--accent);padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600}

/* Folder divider */
.folder-divider{margin:40px 0 20px;padding-bottom:8px;border-bottom:2px solid var(--border)}
.folder-divider h2{font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px}
.folder-icon{color:var(--accent)}

/* Mobile */
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:var(--fg)}
@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .main{margin-left:0}
  .hamburger{display:flex}
  .content{padding:20px 16px 60px}
}

/* Scrollbar */
.sidebar::-webkit-scrollbar{width:4px}
.sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
</style>
</head>
<body>
<div class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#6366f1"/>
      <path d="M8 12h16M8 16h12M8 20h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <div>
      <h1>OpenReq</h1>
      <span>API Documentation</span>
    </div>
  </div>
  <nav class="sidebar-nav" id="sidebarNav"></nav>
</div>

<div class="main">
  <div class="topbar">
    <button class="hamburger" id="hamburger" onclick="document.getElementById('sidebar').classList.toggle('open')">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <button class="theme-btn" onclick="toggleTheme()">
      <span id="themeIcon">🌙</span> <span id="themeLabel">Dark</span>
    </button>
  </div>
  <div class="content" id="content"></div>
</div>

<script>
const DATA = __API_DATA_PLACEHOLDER__;

const METHOD_COLORS = {GET:"#22c55e",POST:"#eab308",PUT:"#3b82f6",PATCH:"#a855f7",DELETE:"#ef4444",HEAD:"#6b7280",OPTIONS:"#6b7280"};
const PROTOCOL_COLORS = {websocket:"#14b8a6",graphql:"#e879f9"};

function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML;}

function toggleTheme(){
  const t=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme",t);
  localStorage.setItem("openreq-doc-theme",t);
  document.getElementById("themeIcon").textContent=t==="dark"?"☀️":"🌙";
  document.getElementById("themeLabel").textContent=t==="dark"?"Light":"Dark";
}

function initTheme(){
  const t=localStorage.getItem("openreq-doc-theme")||(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");
  document.documentElement.setAttribute("data-theme",t);
  document.getElementById("themeIcon").textContent=t==="dark"?"☀️":"🌙";
  document.getElementById("themeLabel").textContent=t==="dark"?"Light":"Dark";
}

function copyCode(id){
  const el=document.getElementById(id);
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn=el.parentElement.querySelector(".copy-btn");
    btn.textContent="Copied!";setTimeout(()=>btn.textContent="Copy",1500);
  });
}

function renderNav(){
  const nav=document.getElementById("sidebarNav");
  const groups={};
  DATA.endpoints.forEach((ep,i)=>{
    const folder=ep.folder||"General";
    if(!groups[folder])groups[folder]=[];
    groups[folder].push({ep,i});
  });
  let html="";
  for(const[folder,eps]of Object.entries(groups)){
    html+=`<div class="nav-group"><div class="nav-group-title">${esc(folder)}</div>`;
    eps.forEach(({ep,i})=>{
      const color=METHOD_COLORS[ep.method]||"#6b7280";
      let badge="";
      if(ep.protocol!=="http"){
        const pc=PROTOCOL_COLORS[ep.protocol]||"#6b7280";
        badge=`<span class="protocol-badge" style="background:${pc}">${ep.protocol.toUpperCase()}</span>`;
      }
      html+=`<a class="nav-item" href="#ep-${i}"><span class="method-dot" style="background:${color}"></span>${badge}${esc(ep.name)}</a>`;
    });
    html+=`</div>`;
  }
  nav.innerHTML=html;
}

function renderBodySchema(schema, descs, prefix){
  if(!schema) return "";
  if(typeof schema==="string") return `<div class="code-block">${esc(schema)}</div>`;
  if(Array.isArray(schema)) return `<div class="code-block">${esc(JSON.stringify(schema,null,2))}</div>`;
  let rows="";
  function walk(obj,path){
    for(const[k,v]of Object.entries(obj)){
      const fp=path?path+"."+k:k;
      if(typeof v==="object"&&v!==null&&!Array.isArray(v)){
        rows+=`<tr><td><code>${esc(fp)}</code></td><td>object</td><td>${esc(descs[fp]||"")}</td></tr>`;
        walk(v,fp);
      }else if(Array.isArray(v)){
        rows+=`<tr><td><code>${esc(fp)}[]</code></td><td>array</td><td>${esc(descs[fp]||descs[fp+"[]"]||"")}</td></tr>`;
        if(v.length>0&&typeof v[0]==="object"&&v[0]!==null)walk(v[0],fp+"[]");
      }else{
        rows+=`<tr><td><code>${esc(fp)}</code></td><td>${esc(String(v))}</td><td>${esc(descs[fp]||"")}</td></tr>`;
      }
    }
  }
  walk(schema,"");
  if(!rows)return `<div class="code-block">${esc(JSON.stringify(schema,null,2))}</div>`;
  return `<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSDK(sdk){
  if(!sdk||Object.keys(sdk).length===0)return"";
  const langs=Object.keys(sdk);
  const uid="sdk"+Math.random().toString(36).slice(2,8);
  let tabs=`<div class="section-title">SDK Examples</div><div class="sdk-tabs">`;
  let panels="";
  langs.forEach((l,i)=>{
    tabs+=`<div class="sdk-tab${i===0?" active":""}" onclick="switchTab(this,'${uid}',${i})">${esc(l)}</div>`;
    const cid=uid+"_"+i;
    panels+=`<div class="sdk-panel${i===0?" active":""}" data-group="${uid}" data-idx="${i}">
      <div class="code-block" id="${cid}">${esc(sdk[l])}<button class="copy-btn" onclick="copyCode('${cid}')">Copy</button></div></div>`;
  });
  tabs+=`</div>`;
  return tabs+panels;
}

function switchTab(el,group,idx){
  el.parentElement.querySelectorAll(".sdk-tab").forEach(t=>t.classList.remove("active"));
  el.classList.add("active");
  document.querySelectorAll(`.sdk-panel[data-group="${group}"]`).forEach(p=>{
    p.classList.toggle("active",Number(p.dataset.idx)===idx);
  });
}

function render(){
  const c=DATA.collection;
  let html=`<div class="hero">
    <h1>${esc(c.name)}</h1>
    <p class="desc">${esc(c.ai_description||c.description)}</p>
    <div class="hero-meta">
      <span class="meta-chip">${c.endpoint_count} endpoints</span>
      <span class="meta-chip">Generated: ${esc(c.generated)}</span>
      <span class="meta-chip">OpenReq</span>
    </div>
  </div>`;

  let currentFolder="";
  DATA.endpoints.forEach((ep,i)=>{
    const folder=ep.folder||"General";
    if(folder!==currentFolder){
      currentFolder=folder;
      html+=`<div class="folder-divider"><h2><span class="folder-icon">📁</span> ${esc(folder)}</h2></div>`;
    }

    const mColor=METHOD_COLORS[ep.method]||"#6b7280";
    let protocolBadge="";
    if(ep.protocol!=="http"){
      const pc=PROTOCOL_COLORS[ep.protocol]||"#6b7280";
      protocolBadge=`<span class="protocol-badge" style="background:${pc}">${ep.protocol.toUpperCase()}</span>`;
    }

    html+=`<div class="endpoint" id="ep-${i}">
      <div class="ep-header">
        <span class="method-badge" style="background:${mColor}">${esc(ep.method)}</span>
        ${protocolBadge}
        <span class="ep-url">${esc(ep.url)}</span>
        <span class="ep-name">${esc(ep.name)}</span>
      </div>
      <div class="ep-body">`;

    if(ep.description)html+=`<p class="ep-desc">${esc(ep.description)}</p>`;
    if(ep.notes)html+=`<div class="ep-notes">${esc(ep.notes)}</div>`;

    if(ep.auth){
      html+=`<div style="margin-bottom:12px"><span class="auth-badge">🔒 ${esc(ep.auth.type.toUpperCase())}</span>`;
      if(ep.auth.config_keys.length)html+=` <span style="font-size:12px;color:var(--fg3)">Keys: ${ep.auth.config_keys.map(esc).join(", ")}</span>`;
      html+=`</div>`;
    }

    if(ep.headers.length){
      html+=`<div class="section-title">Headers</div>
        <table><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>`;
      ep.headers.forEach(h=>{
        html+=`<tr><td><code>${esc(h.name)}</code>${h.sensitive?' <span style="color:var(--fg3);font-size:11px">🔒</span>':""}</td>
          <td>${esc(h.type)}</td><td>${esc(h.description)}</td></tr>`;
      });
      html+=`</tbody></table>`;
    }

    if(ep.query_params.length){
      html+=`<div class="section-title">Query Parameters</div>
        <table><thead><tr><th>Parameter</th><th>Type</th><th>Description</th></tr></thead><tbody>`;
      ep.query_params.forEach(p=>{
        html+=`<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.type)}</td><td>${esc(p.description)}</td></tr>`;
      });
      html+=`</tbody></table>`;
    }

    if(ep.body_schema){
      html+=`<div class="section-title">Request Body${ep.body_type?" ("+esc(ep.body_type)+")":""}</div>`;
      html+=renderBodySchema(ep.body_schema, ep.body_fields_desc||{},"");
    }

    if(Object.keys(ep.sdk||{}).length){
      html+=renderSDK(ep.sdk);
    }

    html+=`</div></div>`;
  });

  html+=`<div style="text-align:center;padding:32px 0;color:var(--fg3);font-size:12px">
    Generated by <strong style="color:var(--accent)">OpenReq</strong> — API Documentation Generator
  </div>`;

  document.getElementById("content").innerHTML=html;
}

initTheme();renderNav();render();
</script>
</body>
</html>'''
