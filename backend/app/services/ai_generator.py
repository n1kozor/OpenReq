import json
import logging

from openai import OpenAI

logger = logging.getLogger(__name__)

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
    """Use gpt-5-chat-latest with web search to research a URL and extract all API endpoint documentation."""
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
    api_key: str,
    documentation: str,
    custom_instructions: str | None = None,
    collection_names: list[str] | None = None,
) -> list[dict]:
    """Call OpenAI to parse API docs and return structured endpoints."""
    client = OpenAI(api_key=api_key)

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

    response = client.chat.completions.create(
        model="gpt-5-mini",
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
        temperature=1,
    )

    message = response.choices[0].message

    if message.tool_calls:
        tool_call = message.tool_calls[0]
        args = json.loads(tool_call.function.arguments)
        endpoints = args.get("endpoints", [])

        # Safety net: ensure all URLs are absolute
        for ep in endpoints:
            url = ep.get("url", "")
            if url and not url.startswith(("http://", "https://")):
                ep["url"] = f"https://api.example.com{url if url.startswith('/') else '/' + url}"

        logger.info("AI generated %d endpoints from documentation", len(endpoints))
        return endpoints

    raise ValueError("OpenAI did not return a function call response")
