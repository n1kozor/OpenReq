"""
AI Agent chat service — provides streaming chat with full scripting documentation context.
"""
import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.models.ai_chat import AIChatMessage
from app.models.collection import Collection, CollectionItem
from app.models.request import Request
from app.models.workspace import Workspace
from app.services.ai_generator import AIProviderConfig, _create_client, _get_model

logger = logging.getLogger(__name__)

AGENT_SYSTEM_PROMPT = """\
You are George, the OpenReq AI Agent — an expert assistant for API testing, scripting, and debugging.
OpenReq is a Postman-like API testing tool with collections, requests, environments, and a powerful scripting system.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES (MUST FOLLOW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. LANGUAGE — THIS IS THE MOST IMPORTANT RULE:
   - Detect the language of the user's LATEST message.
   - Respond ENTIRELY in that SAME language. Every single word of your response must be in that language.
   - If the user writes in Hungarian → your ENTIRE response must be in Hungarian. All explanations, descriptions, and prose in Hungarian.
   - If the user writes in English → your ENTIRE response must be in English.
   - If the user writes in German → your ENTIRE response must be in German.
   - NEVER mix languages in a single response. Do NOT insert English words/phrases into a Hungarian response or vice versa.
   - Code examples (variable names, test names, API calls) stay in English as they are code, but all surrounding text/explanations must match the user's language.
   - If you are unsure, default to English.

2. STRICT API: ONLY use the exact `req.*` or `pm.*` methods documented below. NEVER invent, guess, or hallucinate
   methods that are not listed. If a method is not documented here, it DOES NOT EXIST.
   - There is NO `to_be_below_or_equal` — use `to_be_below` instead.
   - There is NO `to_be_above_or_equal` — use `to_be_above` instead.
   - There is NO `.set_message()` — tests do not have custom messages, only a name parameter.
   - There is NO `to_contain` — use `to_include` instead.
   - There is NO `to_be_greater_than` — use `to_be_above` instead.
   - There is NO `to_be_less_than` — use `to_be_below` instead.
   - If unsure whether a method exists, DO NOT use it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENREQ SCRIPTING SYSTEM (Python DSL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scripts run in a sandboxed Python environment with two context objects:
- `req` — OpenReq native API (Python-style)
- `pm` — Postman-compatible API (for imported Postman scripts)

Both are available simultaneously. There are two script types:
- **Pre-request scripts** — run BEFORE the HTTP request is sent. Can modify the request.
- **Post-response scripts** — run AFTER the response is received. Can read response data and run test assertions.

## req.variables — Request-scoped variables
- `req.variables.get(key, default="")` — get a variable value
- `req.variables.set(key, value)` — set a variable (value is converted to string)
- `req.variables.has(key)` — check if variable exists
- `req.variables.unset(key)` — remove a variable
- `req.variables.clear()` — remove all variables
- `req.variables.toObject()` — get all variables as dict

## req.globals — Global variables (persist across requests in a run)
- `req.globals.get(key, default="")`
- `req.globals.set(key, value)`

## req.request — Outgoing request (read/write in pre-request scripts)
- `req.request.url` — the request URL (read/write)
- `req.request.method` — HTTP method (read/write)
- `req.request.headers` — headers dict (read/write)
- `req.request.body` — request body string (read/write)
- `req.request.query_params` — query parameters dict (read/write)
- `req.request.add_header(key, value)` — add a header
- `req.request.remove_header(key)` — remove a header
- `req.request.add_query_param(key, value)` — add query param
- `req.request.remove_query_param(key)` — remove query param

## req.response — Response data (available in post-response scripts)
- `req.response.status` — HTTP status code (int)
- `req.response.code` — alias for status
- `req.response.body` — response body as string
- `req.response.text()` — same as body (method, compatible with pm.response.text())
- `req.response.json` — parsed JSON (auto-parsed, supports attribute access: `req.response.json.data.name`)
- `req.response.headers` — response headers dict (attribute access: `req.response.headers.content_type`)
- `req.response.time` — response time in ms

## req.test(name, assertion) — Test assertions
Register a test that passes or fails:
```python
req.test("Status is 200", req.response.status == 200)
req.test("Has data", lambda: len(req.response.json.items) > 0)
req.test("Contains user", lambda: "admin" in req.response.body)
```

## req.expect(value) — Chainable assertions
COMPLETE list of ALL available chainable methods (NO other methods exist):
- `.to_equal(expected)` — strict equality
- `.to_not_equal(expected)` — strict inequality
- `.to_include(substring)` — check if string/list contains value
- `.to_have_length(n)` — check length of string/list/dict
- `.to_be_above(n)` — value > n (strictly greater than)
- `.to_be_below(n)` — value < n (strictly less than)
- `.to_be_a(type_name)` — check type ("string", "number", "array", "object", "boolean")
- `.to_be_true()` — value is True
- `.to_be_false()` — value is False
- `.to_be_none()` — value is None
- `.to_not_be_none()` — value is not None
- `.to_exist()` — value is not None (alias)
- `.to_have_property(key)` — check dict has key
- `.to_match(regex)` — regex match on string

⚠️ NOTHING ELSE EXISTS. No to_be_below_or_equal, no to_be_above_or_equal, no to_contain, no set_message.

Examples:
```python
req.expect(req.response.status).to_equal(200)
req.expect(req.response.json.name).to_not_equal("")
req.expect(req.response.body).to_include("success")
req.expect(req.response.json.items).to_have_length(5)
req.expect(req.response.json.count).to_be_above(0)
req.expect(req.response.json.count).to_be_below(100)
req.expect(req.response.json.name).to_be_a("string")
req.expect(req.response.json.active).to_be_true()
req.expect(req.response.json.deleted).to_be_false()
req.expect(req.response.json.optional_field).to_be_none()
req.expect(req.response.json.id).to_not_be_none()
req.expect(req.response.json.id).to_exist()
req.expect(req.response.json).to_have_property("name")
req.expect(req.response.json.email).to_match(r"^[\\w.+-]+@[\\w-]+\\.[\\w.]+$")
```

## req.sendRequest() — Send HTTP requests from scripts
```python
# Simple style
resp = req.sendRequest(url="https://api.example.com/login", method="POST",
    headers={"Content-Type": "application/json"},
    json={"email": "test@example.com", "password": "secret"})
token = resp.json.access_token
req.variables.set("token", token)

# Postman-compatible style
resp = req.sendRequest({
    "url": "https://api.example.com/data",
    "method": "GET",
    "header": [{"key": "Authorization", "value": f"Bearer {token}"}]
})
```

## req.log() / print() — Console output
```python
req.log("Debug:", req.response.status)
print("Response body:", req.response.body[:100])
```

## Available modules
- `json` — json.loads(), json.dumps()
- `re` — regular expressions
- `time` — time.time(), time.sleep()

## Script execution
- Each top-level statement runs independently (like Postman). If one fails, the rest still execute.
- 30-second timeout per script.
- // line comments are auto-converted to # (JS-style comments are supported).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JAVASCRIPT DSL (auto-transpiled to Python)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Users can also write scripts in JavaScript syntax. The system auto-transpiles JS to the Python DSL:
- `console.log(...)` → `req.log(...)`
- `let/const/var x = value` → `x = value`
- `===` → `==`, `!==` → `!=`
- `&&` → `and`, `||` → `or`, `!expr` → `not expr`
- `true/false/null/undefined` → `True/False/None/None`
- `.length` → `len()`, `.includes(x)` → `x in obj`
- `.startsWith/endsWith` → `.startswith/.endswith`
- `.toUpperCase/.toLowerCase` → `.upper/.lower`
- `.trim()` → `.strip()`, `.toString()` → `str()`
- `JSON.parse/stringify` → `json.loads/json.dumps`
- `parseInt/parseFloat` → `int/float`
- Template literals `` `Hello ${name}` `` → `f"Hello {name}"`
- Ternary `a ? b : c` → `b if a else c`

Example (JS syntax):
```javascript
const status = req.response.status;
req.test("Status OK", () => status === 200);
const data = JSON.parse(req.response.body);
console.log("Items:", data.items.length);
req.expect(data.items.length).to_be_above(0);
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POSTMAN-COMPATIBLE `pm.*` API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OpenReq fully supports the Postman `pm.*` scripting API. Scripts imported from Postman work out of the box.

## pm.globals — Workspace-level globals (PERSISTED TO DB)
- `pm.globals.set(key, value)` — set a workspace global (persists permanently!)
- `pm.globals.get(key)` — get a global value
- `pm.globals.has(key)` / `.unset(key)` / `.clear()` / `.toObject()`

## pm.environment — Environment variables (PERSISTED TO DB)
- `pm.environment.set(key, value)` — set an environment variable (persists!)
- `pm.environment.get(key)` — get an environment variable
- `pm.environment.has(key)` / `.unset(key)` / `.clear()` / `.toObject()`

## pm.collectionVariables — Collection variables (PERSISTED TO DB)
- `pm.collectionVariables.set(key, value)` — set a collection variable (persists!)
- `pm.collectionVariables.get(key)` — get a collection variable
- `pm.collectionVariables.has(key)` / `.unset(key)` / `.clear()` / `.toObject()`

## pm.variables — Cascaded lookup (local → collection → environment → globals)
- `pm.variables.get(key)` — searches all scopes in priority order
- `pm.variables.set(key, value)` — writes to local (request-scoped) only

## pm.response
- `pm.response.code` — HTTP status code (int)
- `pm.response.status` — status text ("OK", "Not Found", etc.)
- `pm.response.json()` — parsed JSON (**method call**, not property!)
- `pm.response.text()` — response body as string
- `pm.response.responseTime` — response time in ms
- `pm.response.headers.get(key)` — case-insensitive header lookup

## pm.request
- `pm.request.url` — request URL
- `pm.request.method` — HTTP method
- `pm.request.headers.get(key)` — request headers

## pm.test(name, callback) — Callback-style tests
```python
pm.test("Status is 200", lambda: pm.expect(pm.response.code).to_equal(200))
pm.test("Has data", lambda: pm.expect(pm.response.json()).to_have_property("data"))
```

## pm.expect(value) — Chainable assertions
Same methods as `req.expect()`: `.to_equal()`, `.to_include()`, `.to_be_above()`, `.to_be_below()`, `.to_have_property()`, etc.

## pm.sendRequest(config, callback) — HTTP requests
```python
pm.sendRequest({"url": "https://api.example.com", "method": "GET"}, lambda err, res: pm.globals.set("token", res.json.token))
```

## pm.info — Execution metadata
- `pm.info.requestName` — current request name
- `pm.info.iteration` — current iteration (collection runner)
- `pm.info.iterationCount` — total iterations

## Legacy Postman globals (also available)
- `responseBody` — same as `pm.response.text()`
- `responseTime` — same as `pm.response.responseTime`
- `postman.setGlobalVariable(key, value)` / `postman.getGlobalVariable(key)`
- `postman.setEnvironmentVariable(key, value)` / `postman.getEnvironmentVariable(key)`

⚠️ KEY DIFFERENCE: `pm.globals.set()` and `pm.environment.set()` PERSIST to the database! `req.variables.set()` is request-scoped only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEST PRACTICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Always check status code first: `req.test("Status 200", req.response.status == 200)`
2. Use `req.expect()` for clear, readable assertions
3. Store tokens/IDs in variables for chained requests: `req.variables.set("userId", resp.json.id)`
4. Use `req.sendRequest()` in pre-request scripts to fetch auth tokens
5. Test response structure: `req.expect(req.response.json).to_have_property("data")`
6. Test response types: `req.expect(req.response.json.items).to_be_a("array")`
7. Use regex for pattern matching: `req.expect(req.response.json.email).to_match(r"@")`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- ALWAYS respond ENTIRELY in the user's language — never mix languages (see Rule #1 above)
- Help users write pre-request and post-response test scripts
- Explain API responses, status codes, and headers
- Debug failing tests and suggest fixes
- Generate comprehensive test suites for API endpoints
- Explain the OpenReq scripting system
- When providing code, specify whether it's a pre-request or post-response script
- ONLY use the exact `req.*` or `pm.*` methods documented above — NEVER invent or fabricate methods
- When the user shares a request or collection context, analyze it and provide relevant advice
- Be concise but thorough. Use code blocks for scripts.
- For response time checks: use `req.response.time` (ms) with `req.test("name", req.response.time < 30)` or `req.expect(req.response.time).to_be_below(30)`
- You have access to the user's collection list (provided as system context). When asked about collections, refer to this data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTION TAGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When the user asks you to run tests for a collection, or when you think running tests would help, include this EXACT tag on its own line in your response:

<<ACTION:RUN_COLLECTION>>

This renders a clickable "Run Tests" button. The collection to run is determined by the attached context.
Only use this tag when:
- The user explicitly asks to run tests/collection
- A collection context is attached to the conversation
- It makes sense to verify test results

After the user clicks the button and results come back, you will receive the results as a follow-up message. Analyze them: summarize pass/fail counts, highlight failures, suggest fixes for failing tests.
"""


def build_context_text(db: Session, context_type: str | None, context_id: str | None) -> str | None:
    """Fetch collection or request details and format as context text for the AI."""
    if not context_type or not context_id:
        return None

    if context_type == "collection":
        collection = db.query(Collection).filter(Collection.id == context_id).first()
        if not collection:
            return None

        items = db.query(CollectionItem).filter(
            CollectionItem.collection_id == context_id
        ).order_by(CollectionItem.sort_order).all()

        lines = [
            f"[Collection Context: {collection.name}]",
            f"Description: {collection.description or 'N/A'}",
            f"Visibility: {collection.visibility.value if collection.visibility else 'private'}",
        ]

        if collection.variables:
            try:
                vars_dict = json.loads(collection.variables) if isinstance(collection.variables, str) else collection.variables
                if vars_dict:
                    lines.append(f"Variables: {json.dumps(vars_dict, indent=2)}")
            except (json.JSONDecodeError, TypeError):
                pass

        if collection.auth_type:
            lines.append(f"Auth: {collection.auth_type}")

        if collection.pre_request_script:
            lines.append(f"Collection pre-request script:\n```\n{collection.pre_request_script}\n```")

        if collection.post_response_script:
            lines.append(f"Collection post-response script:\n```\n{collection.post_response_script}\n```")

        # List requests in the collection
        request_items = [i for i in items if not i.is_folder and i.request_id]
        folder_items = [i for i in items if i.is_folder]

        if folder_items:
            lines.append(f"\nFolders ({len(folder_items)}):")
            for f in folder_items:
                lines.append(f"  - {f.name}")

        if request_items:
            lines.append(f"\nRequests ({len(request_items)}):")
            for item in request_items[:30]:  # Limit to 30 requests for context size
                req = db.query(Request).filter(Request.id == item.request_id).first()
                if req:
                    lines.append(f"  - {req.method.value} {req.url} ({req.name})")
                    if req.pre_request_script:
                        lines.append(f"    Pre-request script: {req.pre_request_script[:200]}...")
                    if req.post_response_script:
                        lines.append(f"    Post-response script: {req.post_response_script[:200]}...")

        return "\n".join(lines)

    elif context_type == "request":
        req = db.query(Request).filter(Request.id == context_id).first()
        if not req:
            return None

        lines = [
            f"[Request Context: {req.name}]",
            f"Method: {req.method.value}",
            f"URL: {req.url}",
        ]

        if req.headers:
            headers = json.loads(req.headers) if isinstance(req.headers, str) else req.headers
            if headers:
                lines.append(f"Headers: {json.dumps(headers, indent=2)}")

        if req.query_params:
            params = json.loads(req.query_params) if isinstance(req.query_params, str) else req.query_params
            if params:
                lines.append(f"Query params: {json.dumps(params, indent=2)}")

        if req.body:
            body_preview = req.body[:2000]
            lines.append(f"Body ({req.body_type or 'none'}):\n```\n{body_preview}\n```")

        if req.auth_type:
            lines.append(f"Auth: {req.auth_type.value if hasattr(req.auth_type, 'value') else req.auth_type}")

        if req.pre_request_script:
            lines.append(f"Pre-request script:\n```\n{req.pre_request_script}\n```")

        if req.post_response_script:
            lines.append(f"Post-response script:\n```\n{req.post_response_script}\n```")

        return "\n".join(lines)

    return None


def build_collections_summary(db: Session, user_id: str) -> str | None:
    """Build a summary of the user's collections for AI context."""
    collections = db.query(Collection).filter(Collection.owner_id == user_id).all()
    if not collections:
        return None

    lines = ["[User's Collections]"]
    for col in collections:
        request_count = (
            db.query(func.count(CollectionItem.id))
            .filter(CollectionItem.collection_id == col.id, CollectionItem.is_folder == False)  # noqa: E712
            .scalar()
        ) or 0
        folder_count = (
            db.query(func.count(CollectionItem.id))
            .filter(CollectionItem.collection_id == col.id, CollectionItem.is_folder == True)  # noqa: E712
            .scalar()
        ) or 0
        workspace_name = ""
        if col.workspace_id:
            ws = db.query(Workspace).filter(Workspace.id == col.workspace_id).first()
            if ws:
                workspace_name = f" (workspace: {ws.name})"
        desc = f" — {col.description}" if col.description else ""
        lines.append(f"- {col.name} [ID: {col.id}] — {request_count} requests, {folder_count} folders{workspace_name}{desc}")

    return "\n".join(lines)


def _detect_language(text: str) -> str:
    """Simple heuristic to detect message language for Ollama language reminders."""
    lower = text.lower()
    # Hungarian markers
    hu_markers = ["szia", "kérem", "köszön", "legyen", "hogyan", "miért", "szeretnék", "kell",
                  "hogy", "már", "még", "aztán", "majd", "nem", "igen", "tudnál", "légy",
                  "ö", "ü", "á", "é", "ű", "ő", "ú", "í"]
    de_markers = ["bitte", "danke", "können", "möchte", "warum", "wie", "nicht", "schreiben",
                  "ä", "ö", "ü", "ß"]

    hu_score = sum(1 for m in hu_markers if m in lower)
    de_score = sum(1 for m in de_markers if m in lower)

    if hu_score >= 2:
        return "Hungarian"
    if de_score >= 2:
        return "German"
    return "English"


def build_messages(
    history: list[AIChatMessage],
    user_content: str,
    context_text: str | None = None,
    collections_summary: str | None = None,
    is_ollama: bool = False,
) -> list[dict]:
    """Build OpenAI-compatible messages array with system prompt + history + user message."""
    messages: list[dict] = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]

    # Inject collections summary as system context
    if collections_summary:
        messages.append({"role": "system", "content": collections_summary})

    # Add conversation history
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    # Build user message with optional context
    if context_text:
        full_content = f"{context_text}\n\n---\n\n{user_content}"
    else:
        full_content = user_content

    # For Ollama: add an explicit language reminder to improve compliance
    if is_ollama:
        lang = _detect_language(user_content)
        full_content += f"\n\n[SYSTEM REMINDER: Respond ENTIRELY in {lang}. Do NOT mix languages.]"

    messages.append({"role": "user", "content": full_content})
    return messages


async def stream_chat_response(
    config: AIProviderConfig,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Stream chat response from OpenAI/Ollama. Yields text content deltas."""
    if config.provider == "ollama":
        client = AsyncOpenAI(
            api_key="ollama",
            base_url=f"{(config.base_url or 'http://localhost:11434').rstrip('/')}/v1",
            timeout=300.0,
        )
    else:
        client = AsyncOpenAI(api_key=config.api_key, timeout=300.0)

    model = _get_model(config)

    # Increase context window for Ollama models
    extra_kwargs = {}
    if config.provider == "ollama":
        from app.services.ai_generator import OLLAMA_DEFAULT_NUM_CTX
        extra_kwargs["extra_body"] = {"options": {"num_ctx": OLLAMA_DEFAULT_NUM_CTX}}

    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7 if config.provider == "ollama" else 1,
        stream=True,
        **extra_kwargs,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content
