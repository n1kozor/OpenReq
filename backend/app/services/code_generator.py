"""
Code snippet generator — generates code from request parameters for multiple languages.
"""
import json


def _escape_single_quote(s: str) -> str:
    return s.replace("'", "\\'")


def _escape_double_quote(s: str) -> str:
    return s.replace('"', '\\"')


def generate_python_requests(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    lines = ["import requests", ""]

    # URL
    lines.append(f'url = "{url}"')

    # Headers
    if headers:
        lines.append(f"headers = {json.dumps(headers, indent=4)}")
    else:
        lines.append("headers = {}")

    # Query params
    if query_params:
        lines.append(f"params = {json.dumps(query_params, indent=4)}")

    # Auth
    auth_line = ""
    if auth_type == "bearer" and auth_config:
        lines.append(f'headers["Authorization"] = "Bearer {auth_config.get("token", "")}"')
    elif auth_type == "basic" and auth_config:
        auth_line = f', auth=("{auth_config.get("username", "")}", "{auth_config.get("password", "")}")'
    elif auth_type == "api_key" and auth_config:
        placement = auth_config.get("placement", "header")
        if placement == "header":
            lines.append(f'headers["{auth_config.get("key", "X-API-Key")}"] = "{auth_config.get("value", "")}"')
        else:
            if not query_params:
                lines.append("params = {}")
            lines.append(f'params["{auth_config.get("key", "api_key")}"] = "{auth_config.get("value", "")}"')

    # Body
    body_arg = ""
    if body and body_type in ("json", "text", "xml"):
        if body_type == "json":
            try:
                parsed = json.loads(body)
                lines.append(f"payload = {json.dumps(parsed, indent=4)}")
                body_arg = ", json=payload"
            except json.JSONDecodeError:
                lines.append(f'data = """{body}"""')
                body_arg = ", data=data"
        else:
            lines.append(f'data = """{body}"""')
            body_arg = ", data=data"
    elif body and body_type in ("form-data", "x-www-form-urlencoded"):
        try:
            form_data = json.loads(body)
            lines.append(f"data = {json.dumps(form_data, indent=4)}")
            body_arg = ", data=data"
        except json.JSONDecodeError:
            pass

    lines.append("")

    params_arg = ", params=params" if query_params else ""

    lines.append(
        f'response = requests.{method.lower()}(url, headers=headers{params_arg}{body_arg}{auth_line})'
    )
    lines.append("")
    lines.append("print(response.status_code)")
    lines.append("print(response.json())")

    return "\n".join(lines)


def generate_javascript_fetch(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    headers = dict(headers) if headers else {}

    # Auth headers
    if auth_type == "bearer" and auth_config:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == "basic" and auth_config:
        import base64
        cred = base64.b64encode(
            f"{auth_config.get('username', '')}:{auth_config.get('password', '')}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {cred}"
    elif auth_type == "api_key" and auth_config:
        if auth_config.get("placement", "header") == "header":
            headers[auth_config.get("key", "X-API-Key")] = auth_config.get("value", "")

    # Build URL with query params
    full_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_url = f"{url}?{qs}"

    lines = [f'const url = "{full_url}";', ""]
    lines.append("const options = {")
    lines.append(f'  method: "{method}",')

    if headers:
        lines.append(f"  headers: {json.dumps(headers, indent=4)},")

    if body and body_type in ("json", "text", "xml"):
        if body_type == "json":
            lines.append(f"  body: JSON.stringify({body}),")
        else:
            lines.append(f'  body: `{body}`,')

    lines.append("};")
    lines.append("")
    lines.append("fetch(url, options)")
    lines.append("  .then(response => response.json())")
    lines.append("  .then(data => console.log(data))")
    lines.append('  .catch(error => console.error("Error:", error));')

    return "\n".join(lines)


def generate_javascript_axios(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    headers = dict(headers) if headers else {}

    if auth_type == "bearer" and auth_config:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == "basic" and auth_config:
        import base64
        cred = base64.b64encode(
            f"{auth_config.get('username', '')}:{auth_config.get('password', '')}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {cred}"
    elif auth_type == "api_key" and auth_config:
        if auth_config.get("placement", "header") == "header":
            headers[auth_config.get("key", "X-API-Key")] = auth_config.get("value", "")

    lines = ['import axios from "axios";', ""]
    lines.append("const config = {")
    lines.append(f'  method: "{method.lower()}",')
    lines.append(f'  url: "{url}",')

    if headers:
        lines.append(f"  headers: {json.dumps(headers, indent=4)},")

    if query_params:
        lines.append(f"  params: {json.dumps(query_params, indent=4)},")

    if body and body_type in ("json", "text", "xml"):
        if body_type == "json":
            lines.append(f"  data: {body},")
        else:
            lines.append(f'  data: `{body}`,')

    lines.append("};")
    lines.append("")
    lines.append("axios(config)")
    lines.append("  .then(response => console.log(response.data))")
    lines.append("  .catch(error => console.error(error));")

    return "\n".join(lines)


def generate_curl(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    from app.services.import_export import generate_curl as _gen
    return _gen(method, url, headers, body, query_params, auth_type, auth_config)


def generate_go(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    full_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_url = f"{url}?{qs}"

    headers = dict(headers) if headers else {}
    if auth_type == "bearer" and auth_config:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == "basic" and auth_config:
        import base64
        cred = base64.b64encode(
            f"{auth_config.get('username', '')}:{auth_config.get('password', '')}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {cred}"
    elif auth_type == "api_key" and auth_config:
        if auth_config.get("placement", "header") == "header":
            headers[auth_config.get("key", "X-API-Key")] = auth_config.get("value", "")

    lines = ["package main", "", "import (", '\t"fmt"', '\t"io"', '\t"net/http"']
    if body:
        lines.append('\t"strings"')
    lines.append(")", "")
    lines.append("func main() {")

    if body:
        escaped = _escape_double_quote(body)
        lines.append(f'\tbody := strings.NewReader(`{body}`)')
        lines.append(f'\treq, err := http.NewRequest("{method}", "{full_url}", body)')
    else:
        lines.append(f'\treq, err := http.NewRequest("{method}", "{full_url}", nil)')

    lines.append("\tif err != nil {")
    lines.append("\t\tpanic(err)")
    lines.append("\t}")

    for k, v in headers.items():
        lines.append(f'\treq.Header.Set("{k}", "{v}")')

    lines.append("")
    lines.append("\tclient := &http.Client{}")
    lines.append("\tresp, err := client.Do(req)")
    lines.append("\tif err != nil {")
    lines.append("\t\tpanic(err)")
    lines.append("\t}")
    lines.append("\tdefer resp.Body.Close()")
    lines.append("")
    lines.append("\trespBody, _ := io.ReadAll(resp.Body)")
    lines.append('\tfmt.Println(string(respBody))')
    lines.append("}")

    return "\n".join(lines)


def generate_java(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    full_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_url = f"{url}?{qs}"

    headers = dict(headers) if headers else {}
    if auth_type == "bearer" and auth_config:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == "basic" and auth_config:
        import base64
        cred = base64.b64encode(
            f"{auth_config.get('username', '')}:{auth_config.get('password', '')}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {cred}"

    lines = [
        "import java.net.URI;",
        "import java.net.http.HttpClient;",
        "import java.net.http.HttpRequest;",
        "import java.net.http.HttpResponse;",
        "",
        "public class Main {",
        "    public static void main(String[] args) throws Exception {",
        "        HttpClient client = HttpClient.newHttpClient();",
        "",
    ]

    if body:
        lines.append(f'        String body = "{_escape_double_quote(body)}";')
        lines.append(f'        HttpRequest.Builder builder = HttpRequest.newBuilder()')
        lines.append(f'            .uri(URI.create("{full_url}"))')
        lines.append(f'            .method("{method}", HttpRequest.BodyPublishers.ofString(body))')
    else:
        lines.append(f'        HttpRequest.Builder builder = HttpRequest.newBuilder()')
        lines.append(f'            .uri(URI.create("{full_url}"))')
        if method in ("GET", "DELETE"):
            lines.append(f'            .{method}()')
        else:
            lines.append(f'            .method("{method}", HttpRequest.BodyPublishers.noBody())')

    for k, v in headers.items():
        lines.append(f'            .header("{k}", "{_escape_double_quote(v)}")')

    lines.append("            ;")
    lines.append("")
    lines.append("        HttpRequest request = builder.build();")
    lines.append("        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());")
    lines.append("")
    lines.append("        System.out.println(response.statusCode());")
    lines.append("        System.out.println(response.body());")
    lines.append("    }")
    lines.append("}")

    return "\n".join(lines)


def generate_csharp(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    full_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_url = f"{url}?{qs}"

    headers = dict(headers) if headers else {}
    if auth_type == "bearer" and auth_config:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == "basic" and auth_config:
        import base64
        cred = base64.b64encode(
            f"{auth_config.get('username', '')}:{auth_config.get('password', '')}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {cred}"

    content_type = "application/json"
    if body_type == "xml":
        content_type = "application/xml"
    elif body_type == "text":
        content_type = "text/plain"

    lines = [
        "using System;",
        "using System.Net.Http;",
        "using System.Threading.Tasks;",
        "",
        "class Program",
        "{",
        "    static async Task Main()",
        "    {",
        "        using var client = new HttpClient();",
        "",
    ]

    for k, v in headers.items():
        if k.lower() != "content-type":
            lines.append(f'        client.DefaultRequestHeaders.Add("{k}", "{_escape_double_quote(v)}");')

    if body:
        lines.append(f'        var content = new StringContent(@"{_escape_double_quote(body)}", System.Text.Encoding.UTF8, "{content_type}");')
        method_map = {"GET": "GetAsync", "POST": "PostAsync", "PUT": "PutAsync", "DELETE": "DeleteAsync"}
        if method in ("POST", "PUT"):
            lines.append(f'        var response = await client.{method_map.get(method, "PostAsync")}("{full_url}", content);')
        else:
            lines.append(f'        var request = new HttpRequestMessage(HttpMethod.{method.capitalize()}, "{full_url}");')
            lines.append(f'        request.Content = content;')
            lines.append(f'        var response = await client.SendAsync(request);')
    else:
        if method == "GET":
            lines.append(f'        var response = await client.GetAsync("{full_url}");')
        elif method == "DELETE":
            lines.append(f'        var response = await client.DeleteAsync("{full_url}");')
        else:
            lines.append(f'        var request = new HttpRequestMessage(HttpMethod.{method.capitalize()}, "{full_url}");')
            lines.append(f'        var response = await client.SendAsync(request);')

    lines.append("")
    lines.append("        var body = await response.Content.ReadAsStringAsync();")
    lines.append("        Console.WriteLine($\"{response.StatusCode}\");")
    lines.append("        Console.WriteLine(body);")
    lines.append("    }")
    lines.append("}")

    return "\n".join(lines)


def generate_php(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    full_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_url = f"{url}?{qs}"

    headers = dict(headers) if headers else {}
    if auth_type == "bearer" and auth_config:
        headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_type == "basic" and auth_config:
        import base64
        cred = base64.b64encode(
            f"{auth_config.get('username', '')}:{auth_config.get('password', '')}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {cred}"

    lines = ["<?php", "", "$ch = curl_init();", ""]
    lines.append(f'curl_setopt($ch, CURLOPT_URL, "{full_url}");')
    lines.append("curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);")

    if method != "GET":
        lines.append(f'curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "{method}");')

    if headers:
        lines.append("curl_setopt($ch, CURLOPT_HTTPHEADER, [")
        for k, v in headers.items():
            lines.append(f'    "{k}: {v}",')
        lines.append("]);")

    if body:
        escaped = body.replace("'", "\\'")
        lines.append(f"curl_setopt($ch, CURLOPT_POSTFIELDS, '{escaped}');")

    lines.append("")
    lines.append("$response = curl_exec($ch);")
    lines.append("$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);")
    lines.append("curl_close($ch);")
    lines.append("")
    lines.append("echo $httpCode . \"\\n\";")
    lines.append("echo $response;")

    return "\n".join(lines)


# ── Master dispatcher ──

GENERATORS = {
    "curl": generate_curl,
    "python": generate_python_requests,
    "javascript_fetch": generate_javascript_fetch,
    "javascript_axios": generate_javascript_axios,
    "go": generate_go,
    "java": generate_java,
    "csharp": generate_csharp,
    "php": generate_php,
}

LANGUAGE_LABELS = {
    "curl": "cURL",
    "python": "Python (requests)",
    "javascript_fetch": "JavaScript (fetch)",
    "javascript_axios": "JavaScript (axios)",
    "go": "Go",
    "java": "Java",
    "csharp": "C#",
    "php": "PHP",
}


def generate_code(
    language: str,
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    body_type: str = "none",
    query_params: dict[str, str] | None = None,
    auth_type: str = "none",
    auth_config: dict[str, str] | None = None,
) -> str:
    generator = GENERATORS.get(language)
    if not generator:
        raise ValueError(f"Unsupported language: {language}. Supported: {list(GENERATORS.keys())}")

    return generator(
        method=method,
        url=url,
        headers=headers,
        body=body,
        body_type=body_type,
        query_params=query_params,
        auth_type=auth_type,
        auth_config=auth_config,
    )
