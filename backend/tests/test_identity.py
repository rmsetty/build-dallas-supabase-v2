"""JWT authenticity is checked by Appwrite before a bounded identity cache hit."""

import base64
import json
import sys
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.core import request_context
from fastapi import HTTPException

from tests.conftest import MemoryCache


def token(expires):
    body = (
        base64.urlsafe_b64encode(json.dumps({"exp": expires}).encode())
        .decode()
        .rstrip("=")
    )
    return "header." + body + ".signature"


@pytest.mark.asyncio
async def test_identity_verification_cache_and_expiration(monkeypatch):
    fetch = AsyncMock(
        return_value=SimpleNamespace(
            status=200,
            text=AsyncMock(
                return_value=json.dumps(
                    {
                        "$id": "alice",
                        "email": "alice@example.com",
                        "status": True,
                        "emailVerification": True,
                    }
                )
            ),
        )
    )
    monkeypatch.setitem(
        sys.modules,
        "js",
        SimpleNamespace(
            fetch=fetch, AbortSignal=SimpleNamespace(timeout=lambda ms: None)
        ),
    )
    monkeypatch.setattr(request_context, "js_options", lambda value: value)
    cache = MemoryCache()
    storage = SimpleNamespace(cache=cache)
    request = SimpleNamespace(
        scope={
            "env": SimpleNamespace(
                APPWRITE_PROJECT_ID="project",
                APPWRITE_ENDPOINT="https://appwrite.test/v1",
                AUTH_CACHE_TTL="60",
            )
        }
    )
    value = token(int(time.time()) + 15)
    for _ in range(2):
        context = await request_context.verify_identity(value, request, storage)
        assert context.user_id == "alice"
    assert fetch.call_count == 1
    key, entry = next(iter(cache.values.items()))
    assert value not in key and entry[0] <= time.time() + 15
    with pytest.raises(HTTPException) as exc:
        await request_context.verify_identity(
            token(int(time.time()) - 1), request, storage
        )
    assert exc.value.status_code == 401
    fetch.return_value.status = 401
    with pytest.raises(HTTPException) as exc:
        await request_context.verify_identity(
            token(int(time.time()) + 900), request, storage
        )
    assert exc.value.status_code == 401
    assert len(cache.values) == 1


@pytest.mark.asyncio
async def test_unverified_identity_is_not_cached(monkeypatch):
    fetch = AsyncMock(
        return_value=SimpleNamespace(
            status=200,
            text=AsyncMock(
                return_value=json.dumps(
                    {
                        "$id": "alice",
                        "email": "alice@example.com",
                        "status": True,
                        "emailVerification": False,
                    }
                )
            ),
        )
    )
    monkeypatch.setitem(
        sys.modules,
        "js",
        SimpleNamespace(
            fetch=fetch, AbortSignal=SimpleNamespace(timeout=lambda ms: None)
        ),
    )
    monkeypatch.setattr(request_context, "js_options", lambda value: value)
    cache = MemoryCache()
    request = SimpleNamespace(
        scope={
            "env": SimpleNamespace(
                APPWRITE_PROJECT_ID="project",
                APPWRITE_ENDPOINT="https://appwrite.test/v1",
            )
        }
    )
    with pytest.raises(HTTPException) as exc:
        await request_context.verify_identity(
            token(int(time.time()) + 900), request, SimpleNamespace(cache=cache)
        )
    assert exc.value.status_code == 403
    assert not cache.values
