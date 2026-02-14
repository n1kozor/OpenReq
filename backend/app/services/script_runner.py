"""
Script execution engine for pre-request and post-response scripts.
Uses sandboxed exec() for full Python syntax support.
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

_script_http_pool = ThreadPoolExecutor(max_workers=4)

# ── Timeout for script execution (seconds) ──
SCRIPT_TIMEOUT = 30


def _wrap_value(val: Any) -> Any:
    """Recursively wrap dicts/lists for attribute-style access."""
    if isinstance(val, dict) and not isinstance(val, _AttrDict):
        return _AttrDict(val)
    if isinstance(val, list) and not isinstance(val, _AttrList):
        return _AttrList(val)
    return val


class _AttrDict(dict):
    """Dict that supports attribute-style access. Returns None for missing keys."""

    def __getattr__(self, name: str) -> Any:
        try:
            return _wrap_value(self[name])
        except KeyError:
            return None

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


class _AttrList(list):
    """List that wraps nested dicts/lists for attribute-style access."""

    def __getitem__(self, index: Any) -> Any:
        return _wrap_value(super().__getitem__(index))

    def __iter__(self):
        for item in super().__iter__():
            yield _wrap_value(item)

    def __getattr__(self, name: str) -> Any:
        # Don't intercept real list methods — only catch non-existent attrs
        raise AttributeError(name)


class _VarAccessor:
    """Dict-like accessor with .get()/.set() — req-compatible."""

    def __init__(self, store: dict[str, str] | None = None):
        self._store: dict[str, str] = dict(store or {})

    def get(self, key: str, default: str = "") -> str:
        return self._store.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self._store[key] = str(value)

    def to_dict(self) -> dict[str, str]:
        return dict(self._store)

    def has(self, key: str) -> bool:
        return key in self._store

    def unset(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def toObject(self) -> dict[str, str]:
        return dict(self._store)


class _ResponseAccessor:
    """Provides req.response.* access in post-response scripts."""

    def __init__(
        self,
        status: int = 0,
        body: str = "",
        headers: dict[str, str] | None = None,
        time: float = 0,
    ):
        self.status = status
        self.code = status
        self.body = body
        self.headers = _AttrDict(headers or {})
        self.time = time
        self._json: Any = None
        self._json_parsed = False

    @property
    def json(self) -> Any:
        if not self._json_parsed:
            self._json_parsed = True
            try:
                val = json.loads(self.body)
                self._json = _wrap_value(val)
            except (json.JSONDecodeError, TypeError):
                self._json = None
        return self._json

    def to_have_status(self, code: int) -> bool:
        return self.status == code


class _TestResult:
    def __init__(self, name: str, passed: bool, error: str | None = None):
        self.name = name
        self.passed = passed
        self.error = error

    def to_dict(self) -> dict:
        return {"name": self.name, "passed": self.passed, "error": self.error}


class _RequestAccessor:
    """Provides req.request.* read/write access in pre-request scripts.

    Allows scripts to read and modify the outgoing request:
      req.request.url           — read/write URL
      req.request.method        — read/write HTTP method
      req.request.headers       — read/write headers dict
      req.request.body          — read/write body string
      req.request.query_params  — read/write query params dict
    """

    def __init__(
        self,
        url: str = "",
        method: str = "GET",
        headers: dict[str, str] | None = None,
        body: str | None = None,
        query_params: dict[str, str] | None = None,
    ):
        self.url: str = url
        self.method: str = method
        self.headers: dict[str, str] = dict(headers or {})
        self.body: str | None = body
        self.query_params: dict[str, str] = dict(query_params or {})

    def add_header(self, key: str, value: str) -> None:
        self.headers[key] = value

    def remove_header(self, key: str) -> None:
        self.headers.pop(key, None)

    def add_query_param(self, key: str, value: str) -> None:
        self.query_params[key] = value

    def remove_query_param(self, key: str) -> None:
        self.query_params.pop(key, None)


class ScriptContext:
    """Context object available to scripts as `req`."""

    def __init__(
        self,
        variables: dict[str, str] | None = None,
        request_url: str = "",
        request_method: str = "GET",
        request_headers: dict[str, str] | None = None,
        request_body: str | None = None,
        request_query_params: dict[str, str] | None = None,
        response_status: int | None = None,
        response_body: str | None = None,
        response_headers: dict[str, str] | None = None,
        response_time: float | None = None,
    ):
        self.variables = _VarAccessor(variables)
        self.globals = _VarAccessor()
        self.request = _RequestAccessor(
            url=request_url,
            method=request_method,
            headers=request_headers,
            body=request_body,
            query_params=request_query_params,
        )
        self.test_results: list[dict[str, Any]] = []
        self.logs: list[str] = []

        # Response accessor (post-response scripts)
        if response_status is not None:
            self.response = _ResponseAccessor(
                status=response_status,
                body=response_body or "",
                headers=response_headers,
                time=response_time or 0,
            )
        else:
            self.response = _ResponseAccessor()

    def log(self, *args: Any) -> None:
        self.logs.append(" ".join(str(a) for a in args))

    def test(self, name: str, assertion: Any) -> None:
        try:
            result = assertion() if callable(assertion) else assertion
            self.test_results.append(_TestResult(name, bool(result)).to_dict())
        except Exception as e:
            self.test_results.append(_TestResult(name, False, str(e)).to_dict())

    def expect(self, value: Any) -> "_Expectation":
        return _Expectation(value, self)

    def sendRequest(self, request: dict | None = None, **kwargs: Any) -> _AttrDict:
        """Send an HTTP request. Supports both dict and keyword styles:

        req.sendRequest({
            "url": "...", "method": "POST",
            "header": [{"key": "...", "value": "..."}],
            "body": {"raw": "..."}
        })

        req.sendRequest(
            url="...", method="POST",
            headers={"Content-Type": "application/json"},
            json={"email": "...", "password": "..."}
        )
        """
        if request is None:
            request = kwargs
        elif kwargs:
            request = {**request, **kwargs}

        url = request.get("url", "")
        method = request.get("method", "GET").upper()

        # Headers: support both Postman-style list and simple dict
        raw_headers = request.get("headers") or request.get("header") or {}
        headers: dict[str, str] = {}
        if isinstance(raw_headers, list):
            for h in raw_headers:
                if isinstance(h, dict):
                    headers[h.get("key", "")] = h.get("value", "")
        elif isinstance(raw_headers, dict):
            headers = dict(raw_headers)

        # Body: support json=dict, body=str, or Postman-style body.raw
        body_str: str | None = None
        json_data = request.get("json")
        if json_data is not None:
            body_str = json.dumps(json_data)
            headers.setdefault("Content-Type", "application/json")
        else:
            body_spec = request.get("body")
            if isinstance(body_spec, str):
                body_str = body_spec
            elif isinstance(body_spec, dict):
                raw = body_spec.get("raw")
                if raw:
                    body_str = raw if isinstance(raw, str) else json.dumps(raw)
                    headers.setdefault("Content-Type", "application/json")

        def _do_request() -> _AttrDict:
            with httpx.Client(timeout=15) as c:
                resp = c.request(method, url, headers=headers, content=body_str)
                try:
                    resp_json = _wrap_value(resp.json())
                except Exception:
                    resp_json = None
                return _AttrDict({
                    "status": resp.status_code,
                    "code": resp.status_code,
                    "body": resp.text,
                    "json": resp_json,
                    "headers": _AttrDict(dict(resp.headers)),
                })

        try:
            future = _script_http_pool.submit(_do_request)
            return future.result(timeout=15)
        except Exception as e:
            self.logs.append(f"sendRequest error: {e}")
            return _AttrDict({"status": 0, "code": 0, "body": "", "json": None, "headers": _AttrDict({})})


class _Expectation:
    """Chainable req.expect(value) assertions.

    Each assertion auto-registers a test result (PASS/FAIL) on the context.
    Raises AssertionError on failure so the AST runner records it as a failed test.
    """

    def __init__(self, value: Any, ctx: ScriptContext):
        self._value = value
        self._ctx = ctx

    def _assert(self, passed: bool, desc: str) -> "_Expectation":
        if not passed:
            raise AssertionError(f"Expected {repr(self._value)} {desc}")
        return self

    def to_equal(self, expected: Any) -> "_Expectation":
        return self._assert(self._value == expected, f"to equal {repr(expected)}")

    def to_not_equal(self, expected: Any) -> "_Expectation":
        return self._assert(self._value != expected, f"to not equal {repr(expected)}")

    def to_include(self, item: Any) -> "_Expectation":
        return self._assert(item in self._value, f"to include {repr(item)}")

    def to_have_length(self, n: int) -> "_Expectation":
        return self._assert(len(self._value) == n, f"to have length {n}, got {len(self._value)}")

    def to_be_above(self, n: Any) -> "_Expectation":
        return self._assert(self._value > n, f"to be above {n}")

    def to_be_below(self, n: Any) -> "_Expectation":
        return self._assert(self._value < n, f"to be below {n}")

    def to_be_a(self, type_name: str) -> "_Expectation":
        type_map = {"string": str, "number": (int, float), "boolean": bool, "object": dict, "array": list}
        return self._assert(isinstance(self._value, type_map.get(type_name, str)), f"to be a {type_name}")

    def to_be_true(self) -> "_Expectation":
        return self._assert(self._value is True, "to be True")

    def to_be_false(self) -> "_Expectation":
        return self._assert(self._value is False, "to be False")

    def to_be_none(self) -> "_Expectation":
        return self._assert(self._value is None, "to be None")

    def to_not_be_none(self) -> "_Expectation":
        return self._assert(self._value is not None, "to not be None")

    def to_exist(self) -> "_Expectation":
        return self._assert(self._value is not None, "to exist")

    def to_have_property(self, prop: str) -> "_Expectation":
        has = prop in self._value if isinstance(self._value, dict) else hasattr(self._value, prop)
        return self._assert(has, f"to have property '{prop}'")

    def to_match(self, pattern: str) -> "_Expectation":
        import re as _re
        return self._assert(bool(_re.search(pattern, str(self._value))), f"to match '{pattern}'")


# ── Sandboxed exec-based script execution ──

_SAFE_BUILTINS = {
    "len": len, "str": str, "int": int, "float": float, "bool": bool,
    "list": list, "dict": dict, "tuple": tuple, "set": set,
    "type": type, "isinstance": isinstance, "issubclass": issubclass,
    "abs": abs, "min": min, "max": max, "sum": sum, "round": round,
    "sorted": sorted, "reversed": reversed,
    "enumerate": enumerate, "range": range, "zip": zip,
    "map": map, "filter": filter, "any": any, "all": all,
    "hasattr": hasattr, "getattr": getattr,
    "True": True, "False": False, "None": None,
    "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError, "AttributeError": AttributeError,
    "AssertionError": AssertionError,
}


def run_script(script: str, context: ScriptContext) -> ScriptContext:
    """Execute a Python script in a sandboxed exec() environment.

    The script has access to:
    - req.variables.set/get/has/unset     — request variables
    - req.globals.set/get                 — global variables
    - req.test("name", assertion)         — test assertions
    - req.log(...)                        — logging
    - req.sendRequest(url=..., ...)       — HTTP requests
    - req.expect(val).to_equal(...)       — chainable expects
    - req.response.status/body/json/...   — response data (post-response)
    - json, re, time modules
    - print() → redirected to req.log
    """
    if not script or not script.strip():
        return context

    # Pre-process: convert // line comments to # (JS-style comments in Python)
    lines = script.split("\n")
    processed = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("//"):
            indent = line[: len(line) - len(stripped)]
            processed.append(indent + "#" + stripped[2:])
        else:
            processed.append(line)
    script = "\n".join(processed)

    safe_globals: dict[str, Any] = {
        "__builtins__": {**_SAFE_BUILTINS, "print": context.log},
        "json": json,
        "re": re,
        "time": time,
        "req": context,
    }

    # Parse into AST so each top-level statement runs independently.
    # If one statement crashes, the rest still execute (like Postman).
    import ast as _ast

    try:
        tree = _ast.parse(script)
    except SyntaxError as e:
        context.logs.append(f"Syntax error: {e}")
        return context

    for node in tree.body:
        stmt_module = _ast.Module(body=[node], type_ignores=[])
        code = compile(stmt_module, "<script>", "exec")
        try:
            exec(code, safe_globals)
        except Exception as e:
            # If this was a req.test(...) call, record it as a failed test
            if (
                isinstance(node, _ast.Expr)
                and isinstance(node.value, _ast.Call)
                and isinstance(node.value.func, _ast.Attribute)
                and node.value.func.attr == "test"
            ):
                test_name = "Unknown test"
                if node.value.args:
                    try:
                        test_name = _ast.literal_eval(node.value.args[0])
                    except Exception:
                        pass
                context.test_results.append(
                    {"name": test_name, "passed": False, "error": str(e)}
                )
            else:
                context.logs.append(f"Script error (line {node.lineno}): {e}")

    return context


def _to_result(ctx: ScriptContext) -> dict[str, Any]:
    return {
        "variables": ctx.variables.to_dict(),
        "globals": ctx.globals.to_dict(),
        "logs": ctx.logs,
        "test_results": ctx.test_results,
        "request_headers": ctx.request.headers,
        "request_url": ctx.request.url,
        "request_method": ctx.request.method,
        "request_body": ctx.request.body,
        "request_query_params": ctx.request.query_params,
    }


def run_pre_request_script(
    script: str,
    variables: dict[str, str] | None = None,
    request_url: str = "",
    request_method: str = "GET",
    request_headers: dict[str, str] | None = None,
    request_body: str | None = None,
    request_query_params: dict[str, str] | None = None,
) -> dict[str, Any]:
    ctx = ScriptContext(
        variables=variables,
        request_url=request_url,
        request_method=request_method,
        request_headers=request_headers,
        request_body=request_body,
        request_query_params=request_query_params,
    )
    run_script(script, ctx)
    return _to_result(ctx)


def run_post_response_script(
    script: str,
    variables: dict[str, str] | None = None,
    response_status: int = 200,
    response_body: str = "",
    response_headers: dict[str, str] | None = None,
    response_time: float = 0,
) -> dict[str, Any]:
    ctx = ScriptContext(
        variables=variables,
        response_status=response_status,
        response_body=response_body,
        response_headers=response_headers,
        response_time=response_time,
    )
    run_script(script, ctx)
    return _to_result(ctx)
