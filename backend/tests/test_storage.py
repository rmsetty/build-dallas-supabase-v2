"""Exercise the production Appwrite adapter contract without external credentials."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.storage.cloudflare import CloudStorage

from tests.conftest import MemoryCache


def storage():
    result = CloudStorage(
        SimpleNamespace(
            DB=None,
            APPWRITE_ENDPOINT="https://appwrite.test/v1",
            APPWRITE_PROJECT_ID="project",
        ),
        "https://worker.test",
    )
    result.cache = MemoryCache()
    return result


@pytest.mark.asyncio
async def test_profiles_are_cached_and_partial_updates_use_patch():
    adapter = storage()
    row = {"$id": "alice", "name": "Alice", "bio": None, "resume_file_id": "resume"}
    adapter.appwrite = AsyncMock(return_value=row)
    assert (await adapter.profile("alice"))["bio"] == ""
    await adapter.profile("alice")
    assert adapter.appwrite.call_count == 1
    adapter.appwrite.side_effect = [row, {**row, "bio": "New bio"}]
    _, result = await adapter.update_profile("alice", {"bio": "New bio"})
    assert result["resume_file_id"] == "resume"
    call = adapter.appwrite.call_args
    assert call.args[0] == "PATCH"
    assert call.kwargs["data"]["data"] == {"bio": "New bio"}
    assert (await adapter.profile("alice"))["bio"] == "New bio"
    assert adapter.appwrite.call_count == 3


@pytest.mark.asyncio
async def test_new_profiles_upsert_with_required_name():
    adapter = storage()
    adapter.appwrite = AsyncMock(side_effect=[None, {"name": "Alice", "$id": "alice"}])
    await adapter.update_profile(
        "alice", {"name": "Alice", "onboarding_complete": True}
    )
    call = adapter.appwrite.call_args
    assert call.args[0] == "PUT"
    assert call.kwargs["data"]["data"] == {"name": "Alice"}


@pytest.mark.asyncio
async def test_large_avatars_are_chunked():
    adapter = storage()
    adapter.appwrite = AsyncMock(return_value={})
    await adapter.put_file("avatars/alice/file-id", b"x" * 5_000_001, "image/png")
    calls = adapter.appwrite.call_args_list
    assert len(calls) == 2
    assert (
        calls[0].kwargs["extra_headers"]["Content-Range"] == "bytes 0-4999999/5000001"
    )
    assert calls[1].kwargs["extra_headers"] == {
        "Content-Range": "bytes 5000000-5000000/5000001",
        "X-Appwrite-ID": "file-id",
    }


@pytest.mark.asyncio
async def test_resume_bucket_fails_closed_when_public():
    from fastapi import HTTPException

    adapter = storage()
    adapter.appwrite = AsyncMock(return_value={"$permissions": ['read("any")']})
    with pytest.raises(HTTPException) as error:
        await adapter.put_file("resumes/alice/file-id", b"%PDF-", "application/pdf")
    assert error.value.status_code == 503
    assert adapter.appwrite.call_count == 1
