"""Community workflows using D1 events and cached Appwrite profiles."""

import json
import logging
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException

from app.core.request_context import RequestContext
from app.schemas.community import (
    CurrentUser,
    Event,
    EventCreate,
    EventPage,
    PrivateProfile,
    Profile,
    ProfileInput,
)
from app.storage.cloudflare import CloudStorage


class CommunityService:
    def __init__(self, storage: CloudStorage):
        self.storage = storage

    async def profile(self, user_id):
        return PrivateProfile.model_validate(await self.storage.profile(user_id))

    async def me(self, context: RequestContext):
        return CurrentUser(
            id=context.user_id,
            email=context.email,
            profile=await self.profile(context.user_id),
        )

    async def _update_profile(self, context, changes):
        previous, updated = await self.storage.update_profile(context.user_id, changes)
        return previous, PrivateProfile.model_validate(updated)

    async def save_profile(self, context: RequestContext, payload: ProfileInput):
        changes = payload.model_dump(mode="json", exclude_unset=True)
        changes["onboarding_complete"] = True
        previous, updated = await self._update_profile(context, changes)
        if (
            "avatar_url" in changes
            and previous.get("avatar_url") != changes["avatar_url"]
        ):
            await self._cleanup_avatar(previous.get("avatar_url"), context.user_id)
        return updated

    async def _cleanup(self, key):
        try:
            await self.storage.delete_file(key)
        except Exception:
            logging.getLogger(__name__).warning("Obsolete file cleanup failed")

    async def _cleanup_avatar(self, url, user_id):
        import re

        legacy = re.search(r"/storage/buckets/([^/]+)/files/([^/?#]+)", str(url or ""))
        if legacy and legacy[1] == self.storage.bucket("avatars/"):
            await self._cleanup("avatars/" + user_id + "/" + legacy[2])
            return
        prefix = self.storage.origin + "/v1/avatars/" + user_id + "/"
        if url and str(url).startswith(prefix):
            file_id = str(url)[len(prefix) :]
            if len(file_id) == 32 and all(c in "0123456789abcdef" for c in file_id):
                await self._cleanup("avatars/" + user_id + "/" + file_id)

    async def upload_avatar(self, context, filename, content, mime_type):
        file_id = uuid4().hex
        key = "avatars/" + context.user_id + "/" + file_id
        try:
            await self.storage.put_file(key, content, mime_type)
            previous, profile = await self._update_profile(
                context,
                {
                    "avatar_url": self.storage.avatar_url(file_id),
                },
            )
        except Exception:
            await self._cleanup(key)
            raise
        await self._cleanup_avatar(previous.get("avatar_url"), context.user_id)
        return profile

    async def delete_avatar(self, context):
        previous, profile = await self._update_profile(context, {"avatar_url": None})
        await self._cleanup_avatar(previous.get("avatar_url"), context.user_id)
        return profile

    async def upload_resume(self, context, filename, content):
        if not (await self.profile(context.user_id)).onboarding_complete:
            raise HTTPException(409, "Save your profile before uploading a resume")
        file_id = uuid4().hex
        key = "resumes/" + context.user_id + "/" + file_id
        try:
            await self.storage.put_file(key, content, "application/pdf")
            previous, profile = await self._update_profile(
                context,
                {
                    "resume_file_id": file_id,
                    "resume_filename": filename,
                    "resume_size": len(content),
                    "resume_uploaded_at": datetime.now(UTC).isoformat(),
                },
            )
        except Exception:
            await self._cleanup(key)
            raise
        if previous.get("resume_file_id"):
            await self._cleanup(
                "resumes/" + context.user_id + "/" + previous["resume_file_id"]
            )
        return profile

    async def delete_resume(self, context):
        previous, profile = await self._update_profile(
            context,
            dict.fromkeys(
                [
                    "resume_file_id",
                    "resume_filename",
                    "resume_size",
                    "resume_uploaded_at",
                ]
            ),
        )
        if previous.get("resume_file_id"):
            await self._cleanup(
                "resumes/" + context.user_id + "/" + previous["resume_file_id"]
            )
        return profile

    async def create_event(self, context: RequestContext, payload: EventCreate):
        host = await self.profile(context.user_id)
        if not host.onboarding_complete:
            raise HTTPException(409, "Complete your profile before creating an event")
        now = datetime.now(UTC).isoformat()
        data = payload.model_dump(mode="json")
        data.update(
            id=uuid4().hex, host_id=context.user_id, created_at=now, updated_at=now
        )
        data["starts_at"] = payload.starts_at.astimezone(UTC).isoformat()
        data["ends_at"] = payload.ends_at.astimezone(UTC).isoformat()
        await self.storage.execute(
            "INSERT INTO events (id,host_id,visibility,starts_at,data) "
            "VALUES (?,?,?,?,?)",
            data["id"],
            context.user_id,
            payload.visibility,
            data["starts_at"],
            json.dumps(data),
        )
        # Public feeds expire after 60s across POPs; invalidate the local default.
        await self.storage.cache.delete("community:20:")
        return self.serialize_event(data, context, host)

    def serialize_event(self, data, context, host):
        data = dict(data)
        data.pop("host_id", None)
        location = data.get("location")
        if (
            location
            and data.get("hide_exact_location")
            and (not context or context.user_id != host.id)
        ):
            data["location"] = {
                "label": location.get("area", ""),
                "area": location.get("area", ""),
            }
        # Explicit public projection avoids leaking resume metadata into hosts.
        public_host = Profile.model_validate(host.model_dump())
        return Event(**data, host=public_host)

    async def get_event(self, event_id, context):
        rows = await self.storage.rows("SELECT data FROM events WHERE id=?", event_id)
        if not rows:
            raise HTTPException(404, "Event not found")
        data = json.loads(rows[0]["data"])
        if data["visibility"] == "private" and (
            not context or data["host_id"] != context.user_id
        ):
            raise HTTPException(404, "Event not found")
        return self.serialize_event(data, context, await self.profile(data["host_id"]))

    async def list_events(self, context, limit, cursor, mine=False):
        if mine and context is None:
            raise HTTPException(401, "Sign in first")
        key = f"community:{limit}:{cursor or ''}"
        # Cache only public, redacted output; authenticated host views are never shared.
        if context is None and not mine:
            cached = await self.storage.cache.get(key)
            if cached is not None:
                return EventPage.model_validate(cached)
        where, params = (
            ("host_id=?", [context.user_id]) if mine else ("visibility=?", ["public"])
        )
        if cursor:
            rows = await self.storage.rows(
                f"SELECT starts_at,id FROM events WHERE id=? AND {where}",
                cursor,
                *params,
            )
            if not rows:
                raise HTTPException(400, "Invalid feed cursor")
            where += " AND (starts_at,id) > (?,?)"
            params += [rows[0]["starts_at"], cursor]
        rows = await self.storage.rows(
            f"SELECT data FROM events WHERE {where} ORDER BY starts_at,id LIMIT ?",
            *params,
            limit + 1,
        )
        records = [json.loads(row["data"]) for row in rows[:limit]]
        hosts = {
            user_id: await self.profile(user_id)
            for user_id in {row["host_id"] for row in records}
        }
        result = EventPage(
            items=[
                self.serialize_event(r, context, hosts[r["host_id"]]) for r in records
            ],
            next_cursor=records[-1]["id"] if len(rows) > limit else None,
        )
        if context is None and not mine:
            await self.storage.cache.put(key, result.model_dump(mode="json"), 60)
        return result
