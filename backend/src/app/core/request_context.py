"""Validate client-issued Appwrite JWTs; session creation stays in the app."""

import base64
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.storage.cloudflare import CloudStorage, get_storage, js_options

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class RequestContext:
    user_id: str
    email: str


async def verify_identity(token: str, request: Request, storage: CloudStorage):
    # exp only caps the cache lifetime; authenticity is established by Appwrite.
    try:
        body = token.split(".")[1]
        expires = int(
            json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))["exp"]
        )
    except (ValueError, KeyError, IndexError, TypeError):
        raise HTTPException(401, "Invalid token") from None
    remaining = expires - int(time.time())
    if remaining <= 0:
        raise HTTPException(401, "Expired token")
    env = request.scope["env"]
    key = (
        "identity:"
        + env.APPWRITE_PROJECT_ID
        + ":"
        + hashlib.sha256(token.encode()).hexdigest()
    )
    user = await storage.cache.get(key)
    if user is None:
        from js import AbortSignal, fetch

        try:
            response = await fetch(
                env.APPWRITE_ENDPOINT.rstrip("/") + "/account",
                js_options(
                    {
                        "signal": AbortSignal.timeout(15_000),
                        "headers": {
                            "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
                            "X-Appwrite-JWT": token,
                        },
                    }
                ),
            )
        except Exception:
            raise HTTPException(503, "Identity provider unavailable") from None
        if response.status in (401, 403):
            raise HTTPException(401, "Invalid or expired token")
        if response.status != 200:
            raise HTTPException(503, "Identity provider unavailable")
        account = json.loads(await response.text())
        if not account.get("status") or not account.get("emailVerification"):
            raise HTTPException(403, "A verified, active email account is required")
        user = {"user_id": account["$id"], "email": account["email"]}
        await storage.cache.put(
            key, user, min(remaining, int(getattr(env, "AUTH_CACHE_TTL", 60)))
        )
    return RequestContext(**user)


async def optional_context(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    storage: Annotated[CloudStorage, Depends(get_storage)],
) -> RequestContext | None:
    if credentials is None:
        if request.headers.get("authorization"):
            raise HTTPException(401, "Use Bearer authentication")
        return None
    return await verify_identity(credentials.credentials, request, storage)


async def require_context(
    context: Annotated[RequestContext | None, Depends(optional_context)],
) -> RequestContext:
    if context is None:
        raise HTTPException(
            401, "Sign in with email first", headers={"WWW-Authenticate": "Bearer"}
        )
    return context
