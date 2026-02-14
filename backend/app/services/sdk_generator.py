"""SDK Generator Service - Generate professional multi-file C# and Python SDKs."""
import json
import io
import zipfile
from typing import Literal
from sqlalchemy.orm import Session
from app.models.collection import Collection, CollectionItem
from app.models.request import Request, HttpMethod


def _sanitize_name(name: str) -> str:
    """Convert name to valid identifier (e.g., 'Get Users' -> 'GetUsers')."""
    return "".join(word.capitalize() for word in name.replace("-", " ").replace("_", " ").split())


def _method_name(item_name: str, method: HttpMethod) -> str:
    """Generate method name from request name and HTTP method."""
    sanitized = _sanitize_name(item_name)
    method_prefix = {
        HttpMethod.GET: "Get",
        HttpMethod.POST: "Create",
        HttpMethod.PUT: "Update",
        HttpMethod.PATCH: "Patch",
        HttpMethod.DELETE: "Delete",
    }.get(method, method.value.capitalize())

    # If name already starts with method prefix, don't duplicate
    if sanitized.startswith(method_prefix):
        return sanitized
    return f"{method_prefix}{sanitized}"


def _extract_path_params(url: str) -> list[str]:
    """Extract path parameters from URL (e.g., /users/{id} -> ['id'])."""
    import re
    return re.findall(r"\{([^}]+)\}", url)


# ══════════════════════════════════════════════════════════════════════════════
# C# SDK Generator
# ══════════════════════════════════════════════════════════════════════════════

def _generate_csharp_client(collection_name: str, requests: list) -> str:
    """Generate main C# client class."""
    class_name = _sanitize_name(collection_name)

    code = f"""using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using {class_name}SDK.Exceptions;

namespace {class_name}SDK
{{
    /// <summary>
    /// {collection_name} API Client
    /// </summary>
    public class {class_name}Client : IDisposable
    {{
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;
        private string _bearerToken;
        private Dictionary<string, string> _customHeaders;

        /// <summary>
        /// Initialize the API client
        /// </summary>
        /// <param name="baseUrl">Base URL of the API</param>
        /// <param name="bearerToken">Optional bearer token for authentication</param>
        public {class_name}Client(string baseUrl, string bearerToken = null)
        {{
            _baseUrl = baseUrl?.TrimEnd('/') ?? throw new ArgumentNullException(nameof(baseUrl));
            _bearerToken = bearerToken;
            _httpClient = new HttpClient();
            _customHeaders = new Dictionary<string, string>();

            if (!string.IsNullOrEmpty(_bearerToken))
            {{
                _httpClient.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue("Bearer", _bearerToken);
            }}
        }}

        /// <summary>
        /// Set or update the authorization bearer token
        /// </summary>
        public void SetBearerToken(string token)
        {{
            _bearerToken = token;
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);
        }}

        /// <summary>
        /// Add a custom header that will be sent with all requests
        /// </summary>
        public void AddHeader(string key, string value)
        {{
            _customHeaders[key] = value;
        }}

        /// <summary>
        /// Remove a custom header
        /// </summary>
        public void RemoveHeader(string key)
        {{
            _customHeaders.Remove(key);
        }}

        private void ApplyCustomHeaders(HttpRequestMessage request)
        {{
            foreach (var header in _customHeaders)
            {{
                request.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }}
        }}

        private async Task<T> SendRequestAsync<T>(HttpRequestMessage request)
        {{
            ApplyCustomHeaders(request);

            try
            {{
                var response = await _httpClient.SendAsync(request);
                var content = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {{
                    throw new ApiException(
                        (int)response.StatusCode,
                        response.ReasonPhrase ?? "Unknown error",
                        content
                    );
                }}

                if (typeof(T) == typeof(string))
                {{
                    return (T)(object)content;
                }}

                return JsonSerializer.Deserialize<T>(content, new JsonSerializerOptions
                {{
                    PropertyNameCaseInsensitive = true
                }});
            }}
            catch (HttpRequestException ex)
            {{
                throw new ApiException(0, "Network error", ex.Message);
            }}
        }}

"""

    # Generate methods for each request
    for item, req in requests:
        method_name = _method_name(item.name, req.method)
        path_params = _extract_path_params(req.url)

        # Build parameters
        params = []
        for param in path_params:
            params.append(f"string {param}")

        # Add body parameter if needed
        has_body = req.method in (HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH) and req.body_type == "json"
        if has_body:
            params.append("object body")

        params_str = ", ".join(params) if params else ""

        # Build URL with path params
        # Keep C# interpolation for _baseUrl while inserting the request path.
        url_expr = f'$"{{_baseUrl}}{req.url}"'

        code += f"""        /// <summary>
        /// {item.name}
        /// </summary>
        public async Task<string> {method_name}Async({params_str})
        {{
            var url = {url_expr};
            var request = new HttpRequestMessage(HttpMethod.{req.method.value.capitalize()}, url);
"""

        if has_body:
            code += """
            var json = JsonSerializer.Serialize(body);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
"""

        code += """
            return await SendRequestAsync<string>(request);
        }

"""

    code += """        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
"""

    return code


def _generate_csharp_exception() -> str:
    """Generate C# exception class."""
    return """using System;

namespace {namespace}.Exceptions
{{
    /// <summary>
    /// Exception thrown when an API request fails
    /// </summary>
    public class ApiException : Exception
    {{
        public int StatusCode {{ get; }}
        public string ResponseContent {{ get; }}

        public ApiException(int statusCode, string message, string responseContent = null)
            : base(message)
        {{
            StatusCode = statusCode;
            ResponseContent = responseContent;
        }}
    }}
}}
"""


def _generate_csharp_csproj(class_name: str) -> str:
    """Generate C# .csproj file."""
    return f"""<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="System.Text.Json" Version="8.0.0" />
  </ItemGroup>

</Project>
"""


def _generate_csharp_readme(collection_name: str, class_name: str) -> str:
    """Generate C# README."""
    return f"""# {collection_name} SDK for C#

Official C# SDK for the {collection_name} API.

## Installation

Add the SDK to your project:

```bash
dotnet add package {class_name}SDK
```

## Quick Start

```csharp
using {class_name}SDK;

var client = new {class_name}Client("https://api.example.com", "your-bearer-token");

// Make API calls
var result = await client.GetDataAsync();
```

## Authentication

Set bearer token:
```csharp
client.SetBearerToken("new-token");
```

## Custom Headers

```csharp
client.AddHeader("X-Custom-Header", "value");
```

## Error Handling

```csharp
try
{{
    var result = await client.GetDataAsync();
}}
catch (ApiException ex)
{{
    Console.WriteLine($"API Error {{ex.StatusCode}}: {{ex.Message}}");
}}
```

## Requirements

- .NET 6.0 or higher

## Generated

This SDK was generated automatically from the API collection.
"""


def generate_csharp_sdk_zip(db: Session, collection_id: str) -> tuple[str, bytes]:
    """Generate C# SDK as ZIP file."""
    collection = db.query(Collection).filter(Collection.id == collection_id).first()
    if not collection:
        raise ValueError("Collection not found")

    # Get all requests
    items = (
        db.query(CollectionItem)
        .filter(
            CollectionItem.collection_id == collection_id,
            CollectionItem.is_folder == False,
            CollectionItem.request_id.isnot(None),
        )
        .all()
    )

    requests = []
    for item in items:
        req = db.query(Request).filter(Request.id == item.request_id).first()
        if req:
            requests.append((item, req))

    class_name = _sanitize_name(collection.name)
    namespace = f"{class_name}SDK"

    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Client file
        client_code = _generate_csharp_client(collection.name, requests)
        zip_file.writestr(f"{namespace}/{class_name}Client.cs", client_code)

        # Exception file
        exception_code = _generate_csharp_exception().replace("{namespace}", namespace)
        zip_file.writestr(f"{namespace}/Exceptions/ApiException.cs", exception_code)

        # Project file
        csproj = _generate_csharp_csproj(class_name)
        zip_file.writestr(f"{namespace}/{namespace}.csproj", csproj)

        # README
        readme = _generate_csharp_readme(collection.name, class_name)
        zip_file.writestr(f"{namespace}/README.md", readme)

    zip_buffer.seek(0)
    return f"{namespace}.zip", zip_buffer.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
# Python SDK Generator
# ══════════════════════════════════════════════════════════════════════════════

def _generate_python_client(collection_name: str, requests: list, module_name: str) -> str:
    """Generate main Python client class."""
    class_name = _sanitize_name(collection_name)

    code = f'''"""
{collection_name} API Client
"""
import requests
from typing import Optional, Dict, Any
from urllib.parse import urljoin
from .exceptions import ApiException


class {class_name}Client:
    """
    {collection_name} API Client

    Args:
        base_url: Base URL for the API
        bearer_token: Optional bearer token for authentication
    """

    def __init__(self, base_url: str, bearer_token: Optional[str] = None):
        """Initialize the API client."""
        if not base_url:
            raise ValueError("base_url is required")

        self.base_url = base_url.rstrip("/")
        self.bearer_token = bearer_token
        self.session = requests.Session()
        self.custom_headers = {{}}

        if self.bearer_token:
            self.session.headers["Authorization"] = f"Bearer {{self.bearer_token}}"

    def set_bearer_token(self, token: str) -> None:
        """Set or update the authorization bearer token."""
        self.bearer_token = token
        self.session.headers["Authorization"] = f"Bearer {{token}}"

    def add_header(self, key: str, value: str) -> None:
        """Add a custom header that will be sent with all requests."""
        self.custom_headers[key] = value

    def remove_header(self, key: str) -> None:
        """Remove a custom header."""
        self.custom_headers.pop(key, None)

    def _request(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> requests.Response:
        """
        Make HTTP request with error handling.

        Args:
            method: HTTP method
            path: Request path
            json: JSON body
            params: Query parameters

        Returns:
            Response object

        Raises:
            ApiException: If request fails
        """
        url = urljoin(self.base_url, path.lstrip("/"))

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=json,
                params=params,
                headers=self.custom_headers,
            )

            if not response.ok:
                raise ApiException(
                    status_code=response.status_code,
                    message=response.reason or "Unknown error",
                    response_content=response.text,
                )

            return response

        except requests.RequestException as e:
            raise ApiException(
                status_code=0,
                message="Network error",
                response_content=str(e),
            )

'''

    # Generate methods for each request
    for item, req in requests:
        method_name = item.name.lower().replace(" ", "_").replace("-", "_")
        path_params = _extract_path_params(req.url)

        # Build parameters
        params = []
        for param in path_params:
            params.append(f"{param}: str")

        # Add body parameter if needed
        has_body = req.method in (HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH) and req.body_type == "json"
        if has_body:
            params.append("body: Optional[Dict[str, Any]] = None")

        params_str = ", ".join(params) if params else ""
        if params_str:
            params_str = ", " + params_str

        # Build path with f-string
        path_expr = req.url
        for param in path_params:
            path_expr = path_expr.replace(f"{{{param}}}", f"{{{param}}}")

        code += f'''    def {method_name}(self{params_str}) -> requests.Response:
        """
        {item.name}

'''

        # Add parameter docs
        if path_params or has_body:
            code += "        Args:\n"
            for param in path_params:
                code += f"            {param}: Path parameter\n"
            if has_body:
                code += "            body: Request body\n"
            code += "\n"

        code += f'''        Returns:
            Response object

        Raises:
            ApiException: If request fails
        """
        path = f"{path_expr}"
'''

        if has_body:
            code += f'''        return self._request("{req.method.value.upper()}", path, json=body)
'''
        else:
            code += f'''        return self._request("{req.method.value.upper()}", path)
'''

        code += "\n"

    return code


def _generate_python_exception() -> str:
    """Generate Python exception class."""
    return '''"""Custom exceptions for the API client."""


class ApiException(Exception):
    """Exception raised when an API request fails."""

    def __init__(self, status_code: int, message: str, response_content: str = None):
        """
        Initialize the exception.

        Args:
            status_code: HTTP status code
            message: Error message
            response_content: Response body content
        """
        self.status_code = status_code
        self.message = message
        self.response_content = response_content
        super().__init__(f"API Error {status_code}: {message}")
'''


def _generate_python_init(module_name: str, class_name: str) -> str:
    """Generate Python __init__.py."""
    return f'''"""
{class_name} SDK - Python API Client
"""

from .client import {class_name}Client
from .exceptions import ApiException

__version__ = "1.0.0"
__all__ = ["{class_name}Client", "ApiException"]
'''


def _generate_python_setup(collection_name: str, module_name: str) -> str:
    """Generate Python setup.py."""
    return f'''"""Setup configuration for {collection_name} SDK."""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="{module_name}",
    version="1.0.0",
    author="Generated SDK",
    description="Python SDK for {collection_name} API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(),
    python_requires=">=3.7",
    install_requires=[
        "requests>=2.25.0",
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
'''


def _generate_python_readme(collection_name: str, module_name: str, class_name: str) -> str:
    """Generate Python README."""
    return f'''# {collection_name} SDK for Python

Official Python SDK for the {collection_name} API.

## Installation

```bash
pip install {module_name}
```

Or install from source:

```bash
python setup.py install
```

## Quick Start

```python
from {module_name} import {class_name}Client

# Initialize client
client = {class_name}Client("https://api.example.com", "your-bearer-token")

# Make API calls
response = client.get_data()
print(response.json())
```

## Authentication

Set bearer token:
```python
client.set_bearer_token("new-token")
```

## Custom Headers

```python
client.add_header("X-Custom-Header", "value")
```

## Error Handling

```python
from {module_name} import ApiException

try:
    response = client.get_data()
except ApiException as e:
    print(f"API Error {{e.status_code}}: {{e.message}}")
```

## Requirements

- Python 3.7+
- requests >= 2.25.0

## Generated

This SDK was generated automatically from the API collection.
'''


def generate_python_sdk_zip(db: Session, collection_id: str) -> tuple[str, bytes]:
    """Generate Python SDK as ZIP file."""
    collection = db.query(Collection).filter(Collection.id == collection_id).first()
    if not collection:
        raise ValueError("Collection not found")

    # Get all requests
    items = (
        db.query(CollectionItem)
        .filter(
            CollectionItem.collection_id == collection_id,
            CollectionItem.is_folder == False,
            CollectionItem.request_id.isnot(None),
        )
        .all()
    )

    requests = []
    for item in items:
        req = db.query(Request).filter(Request.id == item.request_id).first()
        if req:
            requests.append((item, req))

    class_name = _sanitize_name(collection.name)
    module_name = collection.name.lower().replace(" ", "_").replace("-", "_")

    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # __init__.py
        init_code = _generate_python_init(module_name, class_name)
        zip_file.writestr(f"{module_name}/__init__.py", init_code)

        # Client file
        client_code = _generate_python_client(collection.name, requests, module_name)
        zip_file.writestr(f"{module_name}/client.py", client_code)

        # Exception file
        exception_code = _generate_python_exception()
        zip_file.writestr(f"{module_name}/exceptions.py", exception_code)

        # setup.py
        setup_code = _generate_python_setup(collection.name, module_name)
        zip_file.writestr(f"setup.py", setup_code)

        # README
        readme = _generate_python_readme(collection.name, module_name, class_name)
        zip_file.writestr(f"README.md", readme)

        # requirements.txt
        zip_file.writestr(f"requirements.txt", "requests>=2.25.0\n")

    zip_buffer.seek(0)
    return f"{module_name}.zip", zip_buffer.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
# Main generator function
# ══════════════════════════════════════════════════════════════════════════════

def generate_sdk(
    db: Session,
    collection_id: str,
    language: Literal["csharp", "python"],
) -> tuple[str, bytes]:
    """
    Generate SDK for a collection as ZIP file.

    Returns:
        (filename, zip_bytes) tuple
    """
    if language == "csharp":
        return generate_csharp_sdk_zip(db, collection_id)
    elif language == "python":
        return generate_python_sdk_zip(db, collection_id)
    else:
        raise ValueError(f"Unsupported language: {language}")
