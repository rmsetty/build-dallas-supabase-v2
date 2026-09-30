"""Bounded, cached D1 reads. Provider collection never runs on bootstrap."""

import base64
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.storage.cloudflare import CloudStorage


def encode_cursor(row):
    return (
        base64.urlsafe_b64encode(
            json.dumps([row["starts_at"], row["source"], row["id"]]).encode()
        )
        .decode()
        .rstrip("=")
    )


def decode_cursor(cursor):
    try:
        values = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        if (
            not isinstance(values, list)
            or len(values) != 3
            or not all(isinstance(v, str) for v in values)
        ):
            raise ValueError()
        return values
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid catalog cursor") from None


class CatalogService:
    def __init__(self, storage: CloudStorage):
        self.storage = storage

    async def page(self, *, startup=False, limit=100, cursor=None, query=""):
        query = query.strip().lower()
        key = "catalog:v1:" + json.dumps([startup, limit, cursor, query])
        cached = await self.storage.cache.get(key)
        if cached is not None:
            return cached
        # Minute boundary gives stable cache keys and indexed upcoming-event reads.
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        where = "starts_at >= ?"
        params = [now.isoformat()]
        if startup:
            where += " AND startup=1"
        if query:
            where += " AND search_text LIKE ? ESCAPE '\\'"
            params.append(
                "%"
                + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                + "%"
            )
        if cursor:
            where += " AND (starts_at,source,id) > (?,?,?)"
            params.extend(decode_cursor(cursor))
        rows = await self.storage.rows(
            f"SELECT source,id,starts_at,data FROM provider_events WHERE {where} "
            "ORDER BY starts_at,source,id LIMIT ?",
            *params,
            limit + 1,
        )
        status = await self.storage.rows(
            "SELECT source,fetched_at,incomplete FROM ingestion_status"
        )
        by_source = {row["source"]: row for row in status}
        failed = [
            source
            for source in ("luma", "eventbrite", "meetup")
            if source not in by_source
        ]
        stale = any(
            datetime.fromisoformat(row["fetched_at"]) < now - timedelta(hours=24)
            for row in status
        )
        result = {
            "items": [json.loads(row["data"]) for row in rows[:limit]],
            "next_cursor": encode_cursor(rows[limit - 1])
            if len(rows) > limit
            else None,
            "queries": [],
            "failedQueries": [],
            "failedProviders": failed,
            "incomplete": bool(failed)
            or stale
            or any(row["incomplete"] for row in status),
            "fetchedAt": min(
                (row["fetched_at"] for row in status), default=now.isoformat()
            ),
        }
        await self.storage.cache.put(key, result, self.storage.event_ttl)
        return result

    async def detail(self, source, event_id):
        key = f"provider-detail:{source}:{event_id}"
        cached = await self.storage.cache.get(key)
        if cached is not None:
            return cached
        rows = await self.storage.rows(
            "SELECT data FROM provider_events WHERE source=? AND id=?", source, event_id
        )
        if not rows:
            return None
        result = json.loads(rows[0]["data"])
        await self.storage.cache.put(key, result, self.storage.event_ttl)
        return result
