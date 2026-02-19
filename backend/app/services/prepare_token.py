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
_TTL_SECONDS = 300  # 5 minutes


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
        raise ValueError("Invalid token format")
    b64, sig = parts
    compressed = base64.urlsafe_b64decode(b64)
    expected = hmac.new(_SECRET, compressed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("Token signature mismatch")
    payload = zlib.decompress(compressed)
    ctx = json.loads(payload)
    if time.time() - ctx.get("_ts", 0) > _TTL_SECONDS:
        raise ValueError("Token expired")
    return ctx
