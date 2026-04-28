"""
Signed token for the prepare/complete local-proxy flow.

The token carries opaque context from /proxy/prepare to /proxy/complete so
the server can resume post-response processing without the client being able
to tamper with internal state.
"""

import base64
import hashlib
import hmac
import json
import time
import zlib

from app.config import settings

_SECRET = settings.JWT_SECRET_KEY.encode()
# TTL covers the full prepare → local execute → complete round-trip. The previous
# 5 minute window expired during long pre-request scripts or slow local responses,
# producing confusing "Token expired" errors at /complete. 30 minutes is generous
# enough to cover legitimate long requests while still bounding token replay risk.
_TTL_SECONDS = 1800


class PrepareTokenExpired(ValueError):
    """Raised when the prepare token's TTL has elapsed."""


class PrepareTokenInvalid(ValueError):
    """Raised when the prepare token is malformed or signature mismatch."""


def encode_prepare_token(context: dict) -> str:
    context["_ts"] = time.time()
    payload = json.dumps(context, separators=(",", ":")).encode()
    compressed = zlib.compress(payload)
    b64 = base64.urlsafe_b64encode(compressed).decode()
    sig = hmac.new(_SECRET, compressed, hashlib.sha256).hexdigest()
    return f"{b64}.{sig}"


def decode_prepare_token(token: str) -> dict:
    parts = token.rsplit(".", 1)
    if len(parts) != 2:
        raise PrepareTokenInvalid("Invalid prepare token format")
    b64, sig = parts
    try:
        compressed = base64.urlsafe_b64decode(b64)
    except (ValueError, TypeError) as exc:
        raise PrepareTokenInvalid("Invalid prepare token encoding") from exc
    expected = hmac.new(_SECRET, compressed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise PrepareTokenInvalid("Prepare token signature mismatch")
    try:
        payload = zlib.decompress(compressed)
        ctx = json.loads(payload)
    except (zlib.error, ValueError) as exc:
        raise PrepareTokenInvalid("Prepare token payload corrupt") from exc
    age = time.time() - ctx.get("_ts", 0)
    if age > _TTL_SECONDS:
        raise PrepareTokenExpired(
            f"Prepare token expired after {int(age)}s (TTL {_TTL_SECONDS}s) — please resend the request"
        )
    return ctx
