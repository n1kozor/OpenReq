"""
JavaScript-to-Python script transformer for the OpenReq script DSL.

Transforms JavaScript-style scripts into Python DSL equivalents,
then delegates execution to the existing Python script runner.
"""
import re
from typing import Any

from app.services.script_runner import (
    run_pre_request_script as _py_run_pre,
    run_post_response_script as _py_run_post,
)


def _transform_js_line(line: str) -> str:
    """Transform a single line of JavaScript DSL into Python DSL."""
    stripped = line.strip()

    # Skip empty lines and comments
    if not stripped or stripped.startswith("//") or stripped.startswith("#"):
        return line

    result = stripped

    # ── console.log(...) → req.log(...) ──
    result = re.sub(r'\bconsole\.log\b', 'req.log', result)

    # ── console.assert(expr) → assert expr ──
    m = re.match(r'console\.assert\((.+)\)\s*;?\s*$', result)
    if m:
        return f"assert {_transform_js_expr(m.group(1))}"

    # ── Remove trailing semicolons ──
    if result.endswith(";"):
        result = result[:-1].rstrip()

    # ── let/const/var declarations → strip keyword, keep assignment ──
    m = re.match(r'(?:let|const|var)\s+(\w+\s*=\s*)(.+)', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2))

    # ── Direct assignment: name = expr ──
    m = re.match(r'(\w+\s*=\s*)(.+)', result)
    if m and not result.startswith("req.") and not result.startswith("assert"):
        return m.group(1) + _transform_js_expr(m.group(2))

    # ── req.test("name", expr) — transform the expression part ──
    m = re.match(r'(req\.test\(\s*["\'].+?["\']\s*,\s*)(.+?)(\)\s*)$', result)
    if m:
        expr = m.group(2).strip()
        # Handle arrow function: () => expr
        arrow_m = re.match(r'\(\)\s*=>\s*(.+)', expr)
        if arrow_m:
            expr = arrow_m.group(1)
        # Handle function() { return expr; }
        func_m = re.match(r'function\s*\(\)\s*\{\s*(?:return\s+)?(.+?);\s*\}', expr)
        if func_m:
            expr = func_m.group(1)
        return m.group(1) + _transform_js_expr(expr) + m.group(3)

    # ── req.variables.set("key", expr) — transform value expression ──
    m = re.match(r'(req\.variables\.set\(\s*["\'].+?["\']\s*,\s*)(.+?)(\)\s*)$', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2)) + m.group(3)

    # ── req.globals.set("key", expr) — transform value expression ──
    m = re.match(r'(req\.globals\.set\(\s*["\'].+?["\']\s*,\s*)(.+?)(\)\s*)$', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2)) + m.group(3)

    # ── req.log(expr) — transform the expression ──
    m = re.match(r'(req\.log\(\s*)(.+?)(\)\s*)$', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2)) + m.group(3)

    # ── req.request.headers["key"] = expr ──
    m = re.match(r'(req\.request\.headers\[.+?\]\s*=\s*)(.+)', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2))

    # ── req.request.url/method/body = expr ──
    m = re.match(r'(req\.request\.(?:url|method|body)\s*=\s*)(.+)', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2))

    # ── req.request.add_header("key", expr) ──
    m = re.match(r'(req\.request\.add_header\(\s*["\'].+?["\']\s*,\s*)(.+?)(\)\s*)$', result)
    if m:
        return m.group(1) + _transform_js_expr(m.group(2)) + m.group(3)

    # ── assert expr ──
    if result.startswith("assert "):
        return "assert " + _transform_js_expr(result[7:])

    # General line — transform as expression
    return _transform_js_expr(result)


def _transform_js_expr(expr: str) -> str:
    """Transform JavaScript expression syntax into Python equivalents."""
    result = expr.strip()
    if not result:
        return result

    # ── Operators ──
    result = result.replace("===", "==")
    result = result.replace("!==", "!=")
    result = result.replace("&&", " and ")
    result = result.replace("||", " or ")
    # JS ! negation at word boundary (but not !=)
    result = re.sub(r'(?<!=)!(?!=)\s*(?=\w)', ' not ', result)

    # ── Boolean/null literals ──
    result = re.sub(r'\btrue\b', 'True', result)
    result = re.sub(r'\bfalse\b', 'False', result)
    result = re.sub(r'\bnull\b', 'None', result)
    result = re.sub(r'\bundefined\b', 'None', result)

    # ── .length → len() ──
    # Match: identifier.length or expression.length (at word boundary)
    result = re.sub(
        r'(\w+(?:\.\w+)*(?:\[[^\]]*\])*)\.length\b',
        r'len(\1)',
        result,
    )

    # ── .includes(x) → x in obj ──
    result = re.sub(
        r'(\w+(?:\.\w+)*(?:\[[^\]]*\])*)\.includes\((.+?)\)',
        r'\2 in \1',
        result,
    )

    # ── .startsWith(x) → obj.startswith(x) ──
    result = re.sub(r'\.startsWith\(', '.startswith(', result)
    result = re.sub(r'\.endsWith\(', '.endswith(', result)

    # ── .toUpperCase() / .toLowerCase() ──
    result = re.sub(r'\.toUpperCase\(\)', '.upper()', result)
    result = re.sub(r'\.toLowerCase\(\)', '.lower()', result)

    # ── .trim() → .strip() ──
    result = re.sub(r'\.trim\(\)', '.strip()', result)

    # ── .toString() → str() — handle complex expressions like int(...).toString() ──
    def _wrap_str(m: re.Match) -> str:
        return f"str({m.group(1)})"
    result = re.sub(
        r'(.+?)\.toString\(\)',
        _wrap_str,
        result,
    )

    # ── typeof x === "type" → isinstance(x, type) ──
    type_map = {
        "string": "str",
        "number": "(int, float)",
        "boolean": "bool",
        "object": "dict",
    }
    for js_type, py_type in type_map.items():
        result = re.sub(
            rf'typeof\s+(\w+(?:\.\w+)*)\s*==\s*["\']' + js_type + r'["\']',
            rf'isinstance(\1, {py_type})',
            result,
        )

    # ── Built-in function mappings ──
    result = re.sub(r'\bparseInt\(', 'int(', result)
    result = re.sub(r'\bparseFloat\(', 'float(', result)
    result = re.sub(r'\bString\(', 'str(', result)
    result = re.sub(r'\bNumber\(', 'float(', result)
    result = re.sub(r'\bBoolean\(', 'bool(', result)

    # ── JSON methods ──
    result = re.sub(r'\bJSON\.parse\(', 'json.loads(', result)
    result = re.sub(r'\bJSON\.stringify\(', 'json.dumps(', result)

    # ── Math methods ──
    result = re.sub(r'\bMath\.abs\(', 'abs(', result)
    result = re.sub(r'\bMath\.round\(', 'round(', result)
    result = re.sub(r'\bMath\.floor\(', 'int(', result)
    result = re.sub(r'\bMath\.ceil\(', '-(-//', result)  # Skip ceil — no clean 1-to-1
    result = re.sub(r'\bMath\.min\(', 'min(', result)
    result = re.sub(r'\bMath\.max\(', 'max(', result)

    # ── Array.isArray(x) → isinstance(x, list) ──
    result = re.sub(
        r'\bArray\.isArray\((.+?)\)',
        r'isinstance(\1, list)',
        result,
    )

    # ── Date.now() → int(time.time() * 1000) ──
    result = re.sub(r'\bDate\.now\(\)', 'int(time.time() * 1000)', result)

    # ── new Date().toISOString() or similar → time reference ──
    result = re.sub(r'\bnew\s+Date\(\)\.getTime\(\)', 'int(time.time() * 1000)', result)

    # ── JS object literal { key: value } → Python dict {"key": value} ──
    # Quote unquoted object keys (word followed by colon, not inside a string or URL)
    # Match  {key:  or  , key:  or  [{key:  patterns — but not http: or https:
    result = re.sub(
        r'(?<=[{,\[])\s*(\b(?!https?|ftp)\w+)\s*:',
        r' "\1":',
        result,
    )

    # ── Simple ternary: condition ? a : b → a if condition else b ──
    ternary_m = re.match(r'^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$', result)
    if ternary_m:
        cond = _transform_js_expr(ternary_m.group(1).strip())
        true_val = _transform_js_expr(ternary_m.group(2).strip())
        false_val = _transform_js_expr(ternary_m.group(3).strip())
        result = f"{true_val} if {cond} else {false_val}"

    # ── Template literals `...${expr}...` → f-string f"...{expr}..." ──
    if '`' in result:
        # Simple template literal conversion
        tl_match = re.match(r'^`(.*)`$', result)
        if tl_match:
            inner = tl_match.group(1)
            # Convert ${expr} to {expr}
            inner = re.sub(r'\$\{(.+?)\}', r'{\1}', inner)
            result = f'f"{inner}"'

    return result


def transform_js_script(script: str) -> str:
    """Transform a full JavaScript script into Python DSL."""
    if not script or not script.strip():
        return script

    # ── Phase 1: Join multi-line JS object literals into single lines ──
    joined_lines: list[str] = []
    brace_depth = 0
    accumulator: list[str] = []

    for raw_line in script.split("\n"):
        stripped = raw_line.strip()

        # Skip comments — pass through directly (unless inside a brace block)
        if brace_depth == 0 and (stripped.startswith("//") or stripped.startswith("#")):
            joined_lines.append(raw_line)
            continue

        # Count braces (outside of strings)
        in_str: str | None = None
        for ch in stripped:
            if in_str:
                if ch == in_str:
                    in_str = None
            elif ch in ('"', "'", "`"):
                in_str = ch
            elif ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth = max(0, brace_depth - 1)

        if brace_depth > 0 or accumulator:
            accumulator.append(stripped)
            if brace_depth == 0:
                # Finished a multi-line block — join it
                joined_lines.append(" ".join(accumulator))
                accumulator = []
        else:
            joined_lines.append(raw_line)

    # Flush any remaining accumulated lines
    if accumulator:
        joined_lines.append(" ".join(accumulator))

    # ── Phase 2: Transform each logical line ──
    transformed = []
    for line in joined_lines:
        transformed.append(_transform_js_line(line))
    return "\n".join(transformed)


def run_pre_request_script_js(
    script: str,
    variables: dict[str, str] | None = None,
    request_url: str = "",
    request_method: str = "GET",
    request_headers: dict[str, str] | None = None,
    request_body: str | None = None,
    request_query_params: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Run a JavaScript pre-request script by transforming to Python DSL."""
    transformed = transform_js_script(script)
    return _py_run_pre(
        script=transformed, variables=variables,
        request_url=request_url, request_method=request_method,
        request_headers=request_headers, request_body=request_body,
        request_query_params=request_query_params,
    )


def run_post_response_script_js(
    script: str,
    variables: dict[str, str] | None = None,
    response_status: int = 200,
    response_body: str = "",
    response_headers: dict[str, str] | None = None,
    response_time: float = 0,
) -> dict[str, Any]:
    """Run a JavaScript post-response script by transforming to Python DSL."""
    transformed = transform_js_script(script)
    return _py_run_post(
        script=transformed,
        variables=variables,
        response_status=response_status,
        response_body=response_body,
        response_headers=response_headers,
        response_time=response_time,
    )
