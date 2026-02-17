"""
Postman-compatible `pm.*` scripting context.

Provides a `PostmanContext` object injected as `pm` into the script exec() namespace,
alongside the existing `req` (ScriptContext). Both share the same test_results and logs
lists so results merge naturally.

Supports:
  - pm.globals / pm.environment / pm.collectionVariables — with DB change tracking
  - pm.variables — cascaded lookup (local → collection → environment → globals)
  - pm.response.json() (method), pm.response.code, pm.response.text()
  - pm.request.url, pm.request.method, pm.request.headers
  - pm.test("name", callback), pm.expect(value)
  - pm.sendRequest(url_or_config, callback)
  - pm.info.requestName, pm.info.iteration, pm.info.iterationCount
  - Legacy: responseBody, responseTime, responseCode globals
  - Legacy: postman.setGlobalVariable / getGlobalVariable etc.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import urlsplit

import httpx

# Reuse the shared thread pool from script_runner
from app.services.script_runner import _script_http_pool, _AttrDict, _wrap_value, _Expectation

# ── HTTP status code texts ──
_STATUS_TEXTS = {
    100: "Continue", 101: "Switching Protocols",
    200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 408: "Request Timeout", 409: "Conflict",
    415: "Unsupported Media Type", 422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
    504: "Gateway Timeout",
}


class _PmVarScope:
    """Variable scope with change tracking for DB persistence.

    Tracks every set/unset so the caller can persist changes to the database.
    `_changes[key] = value` means set, `_changes[key] = None` means delete.
    """

    def __init__(self, initial: dict[str, str] | None = None):
        self._store: dict[str, str] = dict(initial or {})
        self._changes: dict[str, str | None] = {}

    def get(self, key: str, default: str = "") -> str:
        val = self._store.get(key)
        return val if val is not None else default

    def set(self, key: str, value: Any) -> None:
        val = str(value)
        self._store[key] = val
        self._changes[key] = val

    def has(self, key: str) -> bool:
        return key in self._store

    def unset(self, key: str) -> None:
        self._store.pop(key, None)
        self._changes[key] = None

    def clear(self) -> None:
        for k in list(self._store.keys()):
            self._changes[k] = None
        self._store.clear()

    def toObject(self) -> dict[str, str]:
        return dict(self._store)

    def replaceIn(self, template: str) -> str:
        """Replace {{key}} placeholders with values from this scope."""
        import re
        def _repl(m: re.Match) -> str:
            return self._store.get(m.group(1), m.group(0))
        return re.sub(r"\{\{(\w+)\}\}", _repl, template)

    def get_changes(self) -> dict[str, str | None]:
        return dict(self._changes)

    def to_dict(self) -> dict[str, str]:
        return dict(self._store)


class _PmCascadedVars:
    """pm.variables — cascaded lookup: local → collection → environment → globals.

    Postman's `pm.variables.get()` searches all scopes in priority order.
    `pm.variables.set()` only writes to the local (request-scoped) store.
    """

    def __init__(
        self,
        local: _PmVarScope,
        collection: _PmVarScope,
        environment: _PmVarScope,
        globals_scope: _PmVarScope,
    ):
        self._local = local
        self._scopes = [local, collection, environment, globals_scope]

    def get(self, key: str, default: str = "") -> str:
        for scope in self._scopes:
            if scope.has(key):
                return scope.get(key)
        return default

    def set(self, key: str, value: Any) -> None:
        self._local.set(key, value)

    def has(self, key: str) -> bool:
        return any(s.has(key) for s in self._scopes)

    def unset(self, key: str) -> None:
        self._local.unset(key)

    def toObject(self) -> dict[str, str]:
        merged: dict[str, str] = {}
        for scope in reversed(self._scopes):  # globals first, local last (overrides)
            merged.update(scope.toObject())
        return merged

    def replaceIn(self, template: str) -> str:
        """Replace {{key}} with cascaded value lookup."""
        import re
        def _repl(m: re.Match) -> str:
            return self.get(m.group(1), m.group(0))
        return re.sub(r"\{\{(\w+)\}\}", _repl, template)


class _PmHeaderList:
    """Postman-compatible header access with case-insensitive lookup."""

    def __init__(self, headers: dict[str, str]):
        self._headers = headers

    def get(self, key: str) -> str | None:
        for k, v in self._headers.items():
            if k.lower() == key.lower():
                return v
        return None

    def has(self, key: str) -> bool:
        return self.get(key) is not None

    def toObject(self) -> dict[str, str]:
        return dict(self._headers)

    def __iter__(self):
        for k, v in self._headers.items():
            yield _AttrDict({"key": k, "value": v})

    def __len__(self):
        return len(self._headers)

    def __repr__(self):
        return repr(self._headers)


class _PmUrl:
    """Simplified pm.request.url — string-like with helper methods."""

    def __init__(self, url: str):
        self._url = url
        self._parts = urlsplit(url)

    def toString(self) -> str:
        return self._url

    def getHost(self) -> str:
        return self._parts.hostname or ""

    def getPath(self) -> str:
        return self._parts.path

    def getPort(self) -> int | None:
        return self._parts.port

    def __str__(self) -> str:
        return self._url

    def __repr__(self) -> str:
        return self._url

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, str):
            return self._url == other
        return NotImplemented

    def __contains__(self, item: str) -> bool:
        return item in self._url

    def __add__(self, other: str) -> str:
        return self._url + other

    def __radd__(self, other: str) -> str:
        return other + self._url


class _PmResponse:
    """pm.response — Postman-compatible response access.

    Key difference from req.response:
      - `pm.response.json()` is a METHOD (Postman convention)
      - `req.response.json` is a PROPERTY
    """

    def __init__(
        self,
        status: int = 0,
        body: str = "",
        headers: dict[str, str] | None = None,
        time_ms: float = 0,
    ):
        self.code = status
        self.status = _STATUS_TEXTS.get(status, str(status))
        self.responseTime = time_ms
        self.responseSize = len(body.encode("utf-8")) if body else 0
        self._body = body
        self._headers = headers or {}
        self._json_cache: Any = None
        self._json_parsed = False

    def json(self) -> Any:
        """Parse response body as JSON. Returns None if not valid JSON."""
        if not self._json_parsed:
            self._json_parsed = True
            try:
                self._json_cache = _wrap_value(json.loads(self._body))
            except (json.JSONDecodeError, TypeError):
                self._json_cache = None
        return self._json_cache

    def text(self) -> str:
        """Return raw response body."""
        return self._body

    @property
    def headers(self) -> _PmHeaderList:
        return _PmHeaderList(self._headers)

    def to_have_status(self, code: int) -> bool:
        return self.code == code


class _PmRequest:
    """pm.request — read access to the outgoing request."""

    def __init__(self, url: str, method: str, headers: dict[str, str] | None = None):
        self.url = _PmUrl(url)
        self.method = method
        self.headers = _PmHeaderList(headers or {})


class _PmInfo:
    """pm.info — request execution metadata."""

    def __init__(
        self,
        request_name: str = "",
        iteration: int = 1,
        iteration_count: int = 1,
    ):
        self.requestName = request_name
        self.iteration = iteration
        self.iterationCount = iteration_count
        self.eventName = "test"  # Postman sets "prerequest" or "test"


class PostmanContext:
    """Top-level `pm` object available in script exec() namespace.

    Provides full Postman-compatible scripting API. Shares test_results and
    logs lists by reference with ScriptContext so results merge.
    """

    def __init__(
        self,
        globals_vars: dict[str, str] | None = None,
        environment_vars: dict[str, str] | None = None,
        collection_vars: dict[str, str] | None = None,
        local_vars: dict[str, str] | None = None,
        request_url: str = "",
        request_method: str = "GET",
        request_headers: dict[str, str] | None = None,
        response_status: int | None = None,
        response_body: str | None = None,
        response_headers: dict[str, str] | None = None,
        response_time: float | None = None,
        request_name: str = "",
        iteration: int = 1,
        iteration_count: int = 1,
        event_name: str = "test",
        # Shared with ScriptContext (same list objects):
        test_results: list | None = None,
        logs: list | None = None,
    ):
        # Variable scopes with DB change tracking
        self.globals = _PmVarScope(globals_vars)
        self.environment = _PmVarScope(environment_vars)
        self.collectionVariables = _PmVarScope(collection_vars)
        self._local = _PmVarScope(local_vars)
        self.variables = _PmCascadedVars(
            self._local, self.collectionVariables, self.environment, self.globals,
        )

        # Shared lists — same objects as ScriptContext
        self._test_results = test_results if test_results is not None else []
        self._logs = logs if logs is not None else []

        # Request
        self.request = _PmRequest(request_url, request_method, request_headers)

        # Response
        if response_status is not None:
            self.response = _PmResponse(
                status=response_status,
                body=response_body or "",
                headers=response_headers,
                time_ms=response_time or 0,
            )
        else:
            self.response = _PmResponse()

        # Info
        self.info = _PmInfo(request_name, iteration, iteration_count)
        self.info.eventName = event_name

    def test(self, name: str, callback: Any) -> None:
        """pm.test("name", callback) — Postman callback-style test.

        In Postman, the callback is a function that throws on failure.
        We also support bool values for convenience.
        """
        try:
            if callable(callback):
                callback()
            elif not callback:
                raise AssertionError("assertion failed")
            self._test_results.append({"name": name, "passed": True, "error": None})
        except Exception as e:
            self._test_results.append({"name": name, "passed": False, "error": str(e)})

    def expect(self, value: Any) -> "_PmExpectation":
        """pm.expect(value) — chainable assertion builder."""
        return _PmExpectation(value, self._test_results)

    def sendRequest(self, request_spec: Any = None, callback: Any = None, **kwargs: Any) -> Any:
        """pm.sendRequest(url_or_config, callback).

        Supports:
          - pm.sendRequest("https://example.com") — simple GET
          - pm.sendRequest({url, method, header, body}) — full config
          - pm.sendRequest(config, function(err, res) { ... }) — callback style
        """
        if isinstance(request_spec, str):
            config: dict = {"url": request_spec, "method": "GET"}
        elif isinstance(request_spec, dict):
            config = dict(request_spec)
        else:
            config = kwargs

        url = config.get("url", "")
        method = config.get("method", "GET").upper()

        # Headers: support both list and dict
        raw_headers = config.get("headers") or config.get("header") or {}
        headers: dict[str, str] = {}
        if isinstance(raw_headers, list):
            for h in raw_headers:
                if isinstance(h, dict):
                    headers[h.get("key", "")] = h.get("value", "")
        elif isinstance(raw_headers, dict):
            headers = dict(raw_headers)

        # Body
        body_str: str | None = None
        json_data = config.get("json")
        if json_data is not None:
            body_str = json.dumps(json_data)
            headers.setdefault("Content-Type", "application/json")
        else:
            body_spec = config.get("body")
            if isinstance(body_spec, str):
                body_str = body_spec
            elif isinstance(body_spec, dict):
                raw = body_spec.get("raw")
                if raw:
                    body_str = raw if isinstance(raw, str) else json.dumps(raw)
                    headers.setdefault("Content-Type", "application/json")

        def _do_request():
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

        err = None
        result = _AttrDict({"status": 0, "code": 0, "body": "", "json": None, "headers": _AttrDict({})})
        try:
            future = _script_http_pool.submit(_do_request)
            result = future.result(timeout=15)
        except Exception as e:
            err = e
            self._logs.append(f"sendRequest error: {e}")

        # Postman callback style: pm.sendRequest(config, function(err, res) {...})
        if callback and callable(callback):
            try:
                callback(err, result)
            except Exception as cb_err:
                self._logs.append(f"sendRequest callback error: {cb_err}")

        return result

    def get_scope_changes(self) -> dict[str, dict[str, str | None]]:
        """Return all variable scope changes for DB persistence."""
        return {
            "globals_updates": self.globals.get_changes(),
            "environment_updates": self.environment.get_changes(),
            "collection_var_updates": self.collectionVariables.get_changes(),
            "local_updates": self._local.get_changes(),
        }


class _PmExpectation:
    """Chainable pm.expect(value) assertions.

    Mirrors _Expectation from script_runner.py but uses shared test_results
    list directly instead of going through ScriptContext.
    """

    def __init__(self, value: Any, test_results: list):
        self._value = value
        self._test_results = test_results
        # Postman-style fluent chain entry points
        self.to = self
        self.be = self
        self.have = self

    def _assert(self, passed: bool, desc: str) -> "_PmExpectation":
        if not passed:
            raise AssertionError(f"Expected {repr(self._value)} {desc}")
        return self

    # ── Assertion methods (support both .to_equal and .to.equal style) ──

    def equal(self, expected: Any) -> "_PmExpectation":
        return self._assert(self._value == expected, f"to equal {repr(expected)}")

    to_equal = equal

    def not_equal(self, expected: Any) -> "_PmExpectation":
        return self._assert(self._value != expected, f"to not equal {repr(expected)}")

    to_not_equal = not_equal

    def include(self, item: Any) -> "_PmExpectation":
        return self._assert(item in self._value, f"to include {repr(item)}")

    to_include = include

    def length(self, n: int) -> "_PmExpectation":
        return self._assert(len(self._value) == n, f"to have length {n}, got {len(self._value)}")

    to_have_length = length

    def above(self, n: Any) -> "_PmExpectation":
        return self._assert(self._value > n, f"to be above {n}")

    to_be_above = above

    def below(self, n: Any) -> "_PmExpectation":
        return self._assert(self._value < n, f"to be below {n}")

    to_be_below = below

    def a(self, type_name: str) -> "_PmExpectation":
        type_map = {"string": str, "number": (int, float), "boolean": bool, "object": dict, "array": list}
        return self._assert(isinstance(self._value, type_map.get(type_name, str)), f"to be a {type_name}")

    to_be_a = a
    an = a

    def ok(self) -> "_PmExpectation":
        return self._assert(bool(self._value), "to be truthy")

    def eql(self, expected: Any) -> "_PmExpectation":
        """Deep equality (same as equal for Python)."""
        return self.equal(expected)

    def oneOf(self, values: list) -> "_PmExpectation":
        return self._assert(self._value in values, f"to be one of {repr(values)}")

    def status(self, code: int) -> "_PmExpectation":
        """pm.expect(pm.response.code).to.have.status(200)"""
        return self._assert(self._value == code, f"to have status {code}")

    def have_property(self, prop: str) -> "_PmExpectation":
        has = prop in self._value if isinstance(self._value, dict) else hasattr(self._value, prop)
        return self._assert(has, f"to have property '{prop}'")

    to_have_property = have_property

    def match(self, pattern: str) -> "_PmExpectation":
        import re
        return self._assert(bool(re.search(pattern, str(self._value))), f"to match '{pattern}'")

    to_match = match

    def __getattr__(self, name: str) -> Any:
        # Support pm.expect(x).not → negated expectation
        if name == "not_":
            return _PmNegatedExpectation(self._value, self._test_results)
        raise AttributeError(name)

    # Aliases for truthy/falsy/null
    def to_be_true(self) -> "_PmExpectation":
        return self._assert(self._value is True, "to be True")

    def to_be_false(self) -> "_PmExpectation":
        return self._assert(self._value is False, "to be False")

    def to_be_none(self) -> "_PmExpectation":
        return self._assert(self._value is None, "to be None")

    def to_not_be_none(self) -> "_PmExpectation":
        return self._assert(self._value is not None, "to not be None")

    def to_exist(self) -> "_PmExpectation":
        return self._assert(self._value is not None, "to exist")


class _PmNegatedExpectation:
    """Negated expectations: pm.expect(val).not_.to.equal(...)"""

    def __init__(self, value: Any, test_results: list):
        self._value = value
        self._test_results = test_results
        self.to = self
        self.be = self
        self.have = self

    def _assert(self, passed: bool, desc: str) -> "_PmNegatedExpectation":
        if not passed:
            raise AssertionError(f"Expected {repr(self._value)} {desc}")
        return self

    def equal(self, expected: Any) -> "_PmNegatedExpectation":
        return self._assert(self._value != expected, f"to not equal {repr(expected)}")

    def include(self, item: Any) -> "_PmNegatedExpectation":
        return self._assert(item not in self._value, f"to not include {repr(item)}")

    def above(self, n: Any) -> "_PmNegatedExpectation":
        return self._assert(self._value <= n, f"to not be above {n}")

    def below(self, n: Any) -> "_PmNegatedExpectation":
        return self._assert(self._value >= n, f"to not be below {n}")


class LegacyPostmanObject:
    """Legacy `postman.*` API (pre-pm era Postman scripts)."""

    def __init__(self, pm: PostmanContext):
        self._pm = pm

    def setGlobalVariable(self, key: str, value: Any) -> None:
        self._pm.globals.set(key, value)

    def getGlobalVariable(self, key: str) -> str:
        return self._pm.globals.get(key)

    def clearGlobalVariable(self, key: str) -> None:
        self._pm.globals.unset(key)

    def setEnvironmentVariable(self, key: str, value: Any) -> None:
        self._pm.environment.set(key, value)

    def getEnvironmentVariable(self, key: str) -> str:
        return self._pm.environment.get(key)

    def clearEnvironmentVariable(self, key: str) -> None:
        self._pm.environment.unset(key)

    def setNextRequest(self, name: str) -> None:
        """Postman's setNextRequest — logged but not implemented."""
        self._pm._logs.append(f"postman.setNextRequest('{name}') called (not supported)")
