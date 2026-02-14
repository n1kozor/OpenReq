"""
OAuth 2.0 token exchange endpoint.
Supports: Authorization Code, Client Credentials, PKCE.
"""
import hashlib
import base64
import logging
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


class OAuthTokenRequest(BaseModel):
    grant_type: str  # "authorization_code" | "client_credentials" | "refresh_token"
    token_url: str
    client_id: str
    client_secret: str | None = None
    code: str | None = None
    redirect_uri: str | None = None
    code_verifier: str | None = None  # PKCE
    scope: str | None = None
    refresh_token: str | None = None


class OAuthPkceGenerate(BaseModel):
    pass


@router.post("/token")
async def exchange_token(
    payload: OAuthTokenRequest,
    current_user: User = Depends(get_current_user),
):
    """Exchange OAuth 2.0 credentials for an access token."""
    data: dict[str, str] = {
        "grant_type": payload.grant_type,
        "client_id": payload.client_id,
    }

    if payload.client_secret:
        data["client_secret"] = payload.client_secret

    if payload.grant_type == "authorization_code":
        if not payload.code:
            raise HTTPException(status_code=400, detail="Authorization code is required")
        data["code"] = payload.code
        if payload.redirect_uri:
            data["redirect_uri"] = payload.redirect_uri
        if payload.code_verifier:
            data["code_verifier"] = payload.code_verifier

    elif payload.grant_type == "client_credentials":
        if payload.scope:
            data["scope"] = payload.scope

    elif payload.grant_type == "refresh_token":
        if not payload.refresh_token:
            raise HTTPException(status_code=400, detail="Refresh token is required")
        data["refresh_token"] = payload.refresh_token

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported grant type: {payload.grant_type}")

    if payload.scope and payload.grant_type != "client_credentials":
        data["scope"] = payload.scope

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                payload.token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if response.status_code >= 400:
            return {
                "success": False,
                "error": response.text,
                "status_code": response.status_code,
            }

        token_data = response.json()
        return {
            "success": True,
            "access_token": token_data.get("access_token", ""),
            "token_type": token_data.get("token_type", "Bearer"),
            "expires_in": token_data.get("expires_in"),
            "refresh_token": token_data.get("refresh_token"),
            "scope": token_data.get("scope"),
            "raw": token_data,
        }

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")


@router.post("/pkce")
async def generate_pkce(
    current_user: User = Depends(get_current_user),
):
    """Generate PKCE code verifier and code challenge."""
    code_verifier = secrets.token_urlsafe(64)[:128]
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()

    return {
        "code_verifier": code_verifier,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
