import json
import logging
import re
from dataclasses import dataclass

from openai import OpenAI

logger = logging.getLogger(__name__)

# Default context window size for Ollama models (tokens)
OLLAMA_DEFAULT_NUM_CTX = 32768


@dataclass
class AIProviderConfig:
    provider: str  # "openai" | "ollama"
    api_key: str | None = None
    base_url: str | None = None  # Ollama base URL (e.g. http://localhost:11434)
    model: str | None = None  # Ollama model name


def _create_client(config: AIProviderConfig) -> OpenAI:
    """Create an OpenAI-compatible client for either OpenAI or Ollama."""
    if config.provider == "ollama":
        return OpenAI(
            api_key="ollama",
            base_url=f"{(config.base_url or 'http://localhost:11434').rstrip('/')}/v1",
            timeout=300.0,
        )
    return OpenAI(api_key=config.api_key, timeout=300.0)


def _get_model(config: AIProviderConfig) -> str:
    """Return the model name based on provider config."""
    if config.provider == "ollama":
        return config.model or "llama3.1"
    return "gpt-5-mini"


SYSTEM_PROMPT = """You are an API documentation parser. Given API documentation text, extract all API endpoints and return them as structured JSON.

CRITICAL URL RULES:
- Every URL MUST be a FULL, absolute URL starting with https:// or http://
- Look for the base URL / host / server URL in the documentation (e.g., "https://api.openai.com/v1", "https://api.stripe.com")
- Combine the base URL with each endpoint path to form the complete URL
- Example: if base is "https://api.example.com/v1" and path is "/users", the url must be "https://api.example.com/v1/users"
- If the documentation does NOT specify a clear base URL, use "https://api.example.com" as the base
- NEVER return just a path like "/users" — always return "https://something.com/users"
- Replace path parameters with example values in curly braces, e.g., https://api.example.com/users/{user_id}

For each endpoint, extract:
- name: A short descriptive name (e.g., "List Users", "Create Order")
- method: HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- url: The FULL absolute URL (https://...) — see rules above
- headers: Common headers as key-value pairs (always include Content-Type if applicable)
- query_params: Query parameters as key-value pairs with example values
- body: Example request body as a JSON string (null if no body). For POST/PUT/PATCH, always try to provide a realistic example body based on the docs.
- body_type: One of "none", "json", "xml", "text", "form-data" (default "json" for POST/PUT/PATCH)
- folder: Logical grouping/category name (e.g., "Users", "Orders", "Auth")
- collection: Collection name to group endpoints into multiple collections when needed

Be thorough — extract EVERY endpoint mentioned in the documentation.
Use realistic example values for parameters and bodies.
If the docs mention authentication, include it in headers where appropriate.
If the user provides custom instructions, follow them precisely.
If the user asks for no folders, set folder to null or empty for all endpoints.
If the user asks for multiple collections, set collection names accordingly."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_api_collection",
            "description": "Creates an API collection from parsed documentation",
            "parameters": {
                "type": "object",
                "properties": {
                    "endpoints": {
                        "type": "array",
                        "description": "List of API endpoints extracted from documentation",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "Short descriptive name for the endpoint",
                                },
                                "method": {
                                    "type": "string",
                                    "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
                                },
                                "url": {
                                    "type": "string",
                                    "description": "FULL absolute URL starting with https:// or http:// — never just a path. Combine base URL from docs with endpoint path.",
                                },
                                "headers": {
                                    "type": "object",
                                    "description": "HTTP headers as key-value pairs",
                                    "additionalProperties": {"type": "string"},
                                },
                                "query_params": {
                                    "type": "object",
                                    "description": "Query parameters with example values",
                                    "additionalProperties": {"type": "string"},
                                },
                                "body": {
                                    "type": ["string", "null"],
                                    "description": "Request body as JSON string, or null",
                                },
                                "body_type": {
                                    "type": "string",
                                    "enum": ["none", "json", "xml", "text", "form-data"],
                                },
                                "folder": {
                                    "type": "string",
                                    "description": "Category/folder name for grouping",
                                },
                                "collection": {
                                    "type": "string",
                                    "description": "Collection name for grouping endpoints into multiple collections",
                                },
                            },
                            "required": ["name", "method", "url"],
                        },
                    },
                },
                "required": ["endpoints"],
            },
        },
    }
]


def _try_parse_endpoints_from_content(content: str) -> list[dict] | None:
    """Try to extract endpoints JSON from plain text response (Ollama fallback).

    When Ollama fails to produce a proper tool_call, it often dumps the JSON
    in the message content instead. This tries to find and parse it.
    """
    # Try direct JSON parse first
    try:
        data = json.loads(content)
        if isinstance(data, dict) and "endpoints" in data:
            return data["endpoints"]
        if isinstance(data, list) and len(data) > 0 and "url" in data[0]:
            return data
    except (json.JSONDecodeError, TypeError, KeyError):
        pass

    # Try to find JSON block in markdown code fences or raw JSON
    json_patterns = [
        re.compile(r"```(?:json)?\s*\n({[\s\S]*?})\n\s*```"),  # fenced code block
        re.compile(r"```(?:json)?\s*\n(\[[\s\S]*?\])\n\s*```"),  # fenced array
        re.compile(r"(\{[\s\S]*\"endpoints\"\s*:\s*\[[\s\S]*\])"),  # raw object with endpoints
    ]
    for pattern in json_patterns:
        match = pattern.search(content)
        if match:
            try:
                data = json.loads(match.group(1))
                if isinstance(data, dict) and "endpoints" in data:
                    return data["endpoints"]
                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                    return data
            except (json.JSONDecodeError, TypeError, KeyError):
                continue

    logger.warning("Could not parse endpoints from AI content response (length=%d)", len(content))
    return None


URL_RESEARCH_PROMPT = """You are an expert API documentation researcher with web search capabilities.

Search the web for the API documentation at: {url}
Then search for every sub-page, resource category, and endpoint reference you can find on that site.

DO NOT just list top-level resource URLs. You MUST find EVERY specific endpoint by searching each resource category.

For EACH endpoint, provide:
- HTTP method (GET, POST, PUT, PATCH, DELETE)
- Full absolute URL with base URL (e.g. https://www.dnd5eapi.co/api/monsters/{{index}})
- All path parameters with descriptions
- All query/filter parameters with example values
- Example request body for POST/PUT/PATCH
- Brief description of what the endpoint does

Drill into every resource category. For example, if the API has "Monsters", "Spells", "Classes":
- List all: GET /api/monsters
- Get by ID: GET /api/monsters/{{index}}
- Sub-resources: GET /api/classes/{{index}}/levels, /api/classes/{{index}}/spells
- Search/filter: GET /api/monsters?challenge_rating=5

Search thoroughly — a comprehensive REST API has 30-100+ endpoints. If you found fewer than 20, search deeper.
Group endpoints by resource category.

Format as structured text:
## Category Name
### Endpoint Name
- Method: GET
- URL: https://base.url/api/resource/{{id}}
- Path params: id (string) - description
- Query params: name (string), limit (int)
- Description: What this endpoint does"""


def fetch_api_docs_from_url(api_key: str, url: str) -> str:
    """Use gpt-5-mini with web search to research a URL and extract all API endpoint documentation.

    This function is OpenAI-only — Ollama does not support web_search.
    """
    client = OpenAI(api_key=api_key, timeout=300.0)

    response = client.responses.create(
        model="gpt-5-mini",
        input=URL_RESEARCH_PROMPT.format(url=url),
        tools=[{"type": "web_search"}],
    )

    content = response.output_text
    if not content or len(content.strip()) < 50:
        raise ValueError("Could not extract API documentation from the provided URL.")

    logger.info("gpt-5-mini web search extracted %d chars of API docs from URL: %s", len(content), url)
    return content


def generate_collection_from_docs(
    config: AIProviderConfig,
    documentation: str,
    custom_instructions: str | None = None,
    collection_names: list[str] | None = None,
) -> list[dict]:
    """Call AI provider to parse API docs and return structured endpoints.

    Supports both OpenAI and Ollama via the OpenAI-compatible API.
    """
    client = _create_client(config)
    model = _get_model(config)

    extra_parts = []
    if custom_instructions and custom_instructions.strip():
        extra_parts.append(f"Custom instructions:\n{custom_instructions.strip()}")
    if collection_names:
        names = ", ".join(collection_names)
        extra_parts.append(
            "Use these collection names when grouping endpoints: "
            f"{names}. Do not invent other collection names."
        )
    else:
        extra_parts.append(
            "If no collection name is provided, generate a concise collection name and set "
            "the collection field for each endpoint. If multiple collections are appropriate, "
            "name each and set collection accordingly."
        )
    extra_text = "\n\n" + "\n\n".join(extra_parts) if extra_parts else ""

    # Build extra kwargs for Ollama (increase context window)
    extra_kwargs = {}
    if config.provider == "ollama":
        extra_kwargs["extra_body"] = {"options": {"num_ctx": OLLAMA_DEFAULT_NUM_CTX}}

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Parse the following API documentation and extract all endpoints.\n"
                    "Include collection names when requested or when helpful.\n\n"
                    f"{documentation}{extra_text}"
                ),
            },
        ],
        tools=TOOLS,
        tool_choice={"type": "function", "function": {"name": "create_api_collection"}},
        temperature=0.7 if config.provider == "ollama" else 1,
        **extra_kwargs,
    )

    message = response.choices[0].message
    endpoints = None

    if message.tool_calls:
        tool_call = message.tool_calls[0]
        args = json.loads(tool_call.function.arguments)
        endpoints = args.get("endpoints", [])
    elif message.content:
        # Fallback: Ollama sometimes returns JSON in content instead of tool_calls
        endpoints = _try_parse_endpoints_from_content(message.content)

    if endpoints is not None:
        # Safety net: ensure all URLs are absolute
        for ep in endpoints:
            url = ep.get("url", "")
            if url and not url.startswith(("http://", "https://")):
                ep["url"] = f"https://api.example.com{url if url.startswith('/') else '/' + url}"

        logger.info("AI (%s/%s) generated %d endpoints from documentation", config.provider, model, len(endpoints))
        return endpoints

    raise ValueError(f"AI provider ({config.provider}/{model}) did not return a function call response")
