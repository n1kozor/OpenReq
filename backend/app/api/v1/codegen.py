"""
API endpoints for code generation and script execution.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.app_settings import get_or_create_settings
from app.services.code_generator import generate_code, LANGUAGE_LABELS
from app.services.script_runner import run_pre_request_script, run_post_response_script
from app.services.js_script_runner import run_pre_request_script_js, run_post_response_script_js

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Code Generation ──

class CodeGenRequest(BaseModel):
    language: str
    method: str
    url: str
    headers: dict[str, str] | None = None
    body: str | None = None
    body_type: str = "none"
    query_params: dict[str, str] | None = None
    auth_type: str = "none"
    auth_config: dict[str, str] | None = None


@router.post("/generate")
async def generate_code_snippet(
    payload: CodeGenRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a code snippet for the given request in the specified language."""
    code = generate_code(
        language=payload.language,
        method=payload.method,
        url=payload.url,
        headers=payload.headers,
        body=payload.body,
        body_type=payload.body_type,
        query_params=payload.query_params,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
    )
    return {"code": code, "language": payload.language}


@router.get("/languages")
async def list_languages(
    current_user: User = Depends(get_current_user),
):
    """List available code generation languages."""
    return {"languages": LANGUAGE_LABELS}


# ── Script Execution ──

class PreRequestScriptRequest(BaseModel):
    script: str
    variables: dict[str, str] | None = None
    language: str = "python"  # "python" or "javascript"


class PostResponseScriptRequest(BaseModel):
    script: str
    variables: dict[str, str] | None = None
    response_status: int = 200
    response_body: str = ""
    response_headers: dict[str, str] | None = None
    response_time: float = 0
    language: str = "python"  # "python" or "javascript"


@router.post("/scripts/pre-request")
async def execute_pre_request_script(
    payload: PreRequestScriptRequest,
    current_user: User = Depends(get_current_user),
):
    """Execute a pre-request script."""
    import asyncio

    if payload.language == "javascript":
        result = await asyncio.to_thread(
            run_pre_request_script_js,
            script=payload.script,
            variables=payload.variables,
        )
    else:
        result = await asyncio.to_thread(
            run_pre_request_script,
            script=payload.script,
            variables=payload.variables,
        )
    return result


@router.post("/scripts/post-response")
async def execute_post_response_script(
    payload: PostResponseScriptRequest,
    current_user: User = Depends(get_current_user),
):
    """Execute a post-response script with response data."""
    import asyncio

    if payload.language == "javascript":
        result = await asyncio.to_thread(
            run_post_response_script_js,
            script=payload.script,
            variables=payload.variables,
            response_status=payload.response_status,
            response_body=payload.response_body,
            response_headers=payload.response_headers,
            response_time=payload.response_time,
        )
    else:
        result = await asyncio.to_thread(
            run_post_response_script,
            script=payload.script,
            variables=payload.variables,
            response_status=payload.response_status,
            response_body=payload.response_body,
            response_headers=payload.response_headers,
            response_time=payload.response_time,
        )
    return result


# ── AI Script Generation ──

PYTHON_SCRIPT_SYSTEM_PROMPT = """You are an expert API testing script generator for the OpenReq platform.
You generate Python scripts for API pre-request and post-response testing.
Scripts are executed with exec() in a sandboxed environment — full Python syntax is supported.

## API Reference

### req object:
- `req.variables.set("key", "value")` — set a variable (auto-resolves in URL/headers/body as {{key}})
- `req.variables.get("key")` — get a variable value
- `req.variables.has("key")` — check if variable exists
- `req.variables.unset("key")` — remove a variable
- `req.globals.set("key", "value")` — set a global variable
- `req.globals.get("key")` — get a global variable
- `req.test("test name", assertion)` — test assertion (bool or callable returning bool)
- `req.expect(value).to_equal(expected)` — chainable assertion
- `req.expect(value).to_include(item)` — check containment
- `req.expect(value).to_have_length(n)` — check length
- `req.expect(value).to_be_above(n)` / `.to_be_below(n)` — numeric comparisons
- `req.expect(value).to_be_a("string"|"number"|"boolean"|"object"|"array")` — type check
- `req.log(...)` — log messages (also: `print()` redirects to req.log)
- `req.sendRequest(url="...", method="POST", json={...}, headers={...})` — send HTTP request, returns response object with .status, .body, .json, .headers

### Request manipulation (pre-request only):
- `req.request.url` — read/write the request URL
- `req.request.method` — read/write the HTTP method
- `req.request.headers["Key"] = "value"` — add/modify request headers directly
- `req.request.body` — read/write the request body
- `req.request.query_params["key"] = "value"` — add/modify query parameters
- `req.request.add_header("Key", "value")` — add a header
- `req.request.remove_header("Key")` — remove a header

### Response access (post-response only):
- `req.response.status` — HTTP status code (int)
- `req.response.body` — raw response body (string)
- `req.response.json` — parsed JSON (supports attribute access: req.response.json.field.nested)
- `req.response.headers["Header-Name"]` — response headers
- `req.response.time` — response time in ms

### Available modules & builtins:
- `json`, `re`, `time`
- `len`, `str`, `int`, `float`, `bool`, `list`, `dict`, `tuple`, `set`
- `isinstance`, `abs`, `min`, `max`, `sum`, `round`, `sorted`, `range`, `enumerate`, `zip`, `map`, `filter`, `any`, `all`
- `hasattr`, `getattr`, `type`

### Full Python syntax:
- if/elif/else, for/while loops, try/except, list comprehensions, f-strings, functions
- Variables set via req.variables.set() are auto-resolved as {{key}} in the request URL, headers, and body

## Rules:
1. Generate ONLY the script code, no markdown, no explanations, no code fences
2. Use # comments to explain sections
3. Write clean, idiomatic Python
4. For pre-request: set variables, generate tokens/timestamps, call external APIs with req.sendRequest()
5. For post-response: validate with req.test(), check status/body/json, extract values to variables
6. Keep scripts practical and concise
7. Use print() or req.log() for debug output

## Examples:

### Pre-request: login and set auth header automatically
```
# Login and set bearer token directly on the request
resp = req.sendRequest(
    url="https://api.example.com/auth/login",
    method="POST",
    json={"email": "user@example.com", "password": "secret"}
)
req.request.headers["Authorization"] = f"Bearer {resp.json.access_token}"
req.variables.set("timestamp", str(int(time.time())))
print(f"Logged in, token set automatically")
```

### Post-response: validate response
```
# Check status
req.test("Status is 200", req.response.status == 200)

# Validate JSON structure
data = req.response.json
req.test("Has items array", isinstance(data.items, list))
req.test("At least one item", len(data.items) > 0)

# Check response time
req.test("Fast response", req.response.time < 500)

# Extract value for next request
if data.items:
    req.variables.set("first_item_id", data.items[0].id)
    print(f"First item: {data.items[0].id}")
```
"""

JS_SCRIPT_SYSTEM_PROMPT = """You are an expert API testing script generator for the OpenReq platform.
You generate JavaScript-style scripts for API pre-request and post-response testing.
Scripts are transpiled to Python and executed — keep syntax simple and line-oriented.

## API Reference

### req object:
- `req.variables.set("key", "value");` — set a variable (auto-resolves in URL/headers/body as {{key}})
- `req.variables.get("key");` — get a variable value
- `req.variables.has("key");` — check if variable exists
- `req.globals.set("key", "value");` — set a global variable
- `req.test("test name", () => expression);` — test assertion
- `req.expect(value).to_equal(expected);` — chainable assertion
- `req.expect(value).to_include(item);` — containment check
- `console.log(message);` — log messages
- `req.sendRequest({ url: "...", method: "POST", headers: {"Content-Type": "application/json"}, body: { raw: JSON.stringify({...}) } });` — HTTP request

### Response access (post-response only):
- `req.response.status` — HTTP status code
- `req.response.body` — raw response body
- `req.response.json` — parsed JSON (attribute access: req.response.json.field.nested)
- `req.response.headers["Header-Name"]` — response headers
- `req.response.time` — response time in ms

### Available:
- `parseInt()`, `parseFloat()`, `String()`, `Number()`, `Boolean()`
- `.length`, `.includes()`, `.startsWith()`, `.endsWith()`, `.trim()`, `.toUpperCase()`, `.toLowerCase()`
- `JSON.parse()`, `JSON.stringify()`, `Math.abs()`, `Math.round()`, `Math.min()`, `Math.max()`, `Date.now()`
- `===`, `!==`, `&&`, `||`, `typeof`, `Array.isArray()`

## Rules:
1. Generate ONLY the script code, no markdown, no explanations, no code fences
2. Use // comments to explain sections
3. Keep lines simple — each statement on its own line
4. Use `===` for equality, end statements with semicolons
5. For pre-request: set variables, generate tokens, call APIs with req.sendRequest()
6. For post-response: validate with req.test(), check status/body/json
7. Keep scripts practical and concise
8. Variables set via req.variables.set() are auto-resolved as {{key}} in the request
"""

PRE_REQUEST_PROMPT = """Generate a PRE-REQUEST script based on this description:

{description}

The script runs BEFORE the HTTP request is sent. Variables set with req.variables.set("key", "value") are automatically resolved as {{{{key}}}} in the request URL, headers, and body. Common tasks:
- Login to APIs and set auth tokens (req.sendRequest + req.variables.set)
- Set dynamic variables (timestamps, UUIDs, computed values)
- Generate tokens or signatures
- Log preparation info with print()"""

POST_RESPONSE_PROMPT = """Generate a POST-RESPONSE test script based on this description:

{description}

The script runs AFTER the HTTP response is received. It has full access to req.response (status, body, json, headers, time). Common tasks:
- Validate status code with req.test()
- Check response body structure and field values
- Use req.response.json for attribute-style access (e.g., req.response.json.data.id)
- Verify response time
- Extract values for subsequent requests with req.variables.set()
- Use if/for/try for complex validation logic"""


class GenerateScriptRequest(BaseModel):
    description: str
    script_type: str = "post-response"  # "pre-request" or "post-response"
    language: str = "python"  # "python" or "javascript"


@router.post("/scripts/generate")
async def generate_script_with_ai(
    payload: GenerateScriptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a pre-request or post-response script using AI."""
    app_settings = get_or_create_settings(db)
    api_key = (app_settings.openai_api_key if app_settings else None) or settings.OPENAI_API_KEY

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenAI API key not configured. Set it in Settings.",
        )

    if not payload.description.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required.",
        )

    system_prompt = (
        JS_SCRIPT_SYSTEM_PROMPT
        if payload.language == "javascript"
        else PYTHON_SCRIPT_SYSTEM_PROMPT
    )

    if payload.script_type == "pre-request":
        user_prompt = PRE_REQUEST_PROMPT.format(description=payload.description.strip())
    else:
        user_prompt = POST_RESPONSE_PROMPT.format(description=payload.description.strip())

    try:
        client = AsyncOpenAI(api_key=api_key, timeout=60.0)
        response = await client.responses.create(
            model="gpt-4.1-nano",
            instructions=system_prompt,
            input=user_prompt,
        )

        script = response.output_text.strip()
        # Remove markdown code fences if present
        if script.startswith("```"):
            lines = script.split("\n")
            lines = lines[1:]  # Remove first ```
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            script = "\n".join(lines)

        return {"script": script, "script_type": payload.script_type}

    except Exception as e:
        logger.error(f"AI script generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )
