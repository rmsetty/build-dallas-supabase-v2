"""Semantic For You feed kept inside included usage.

Events are embedded once (hourly cron). A user's ranking costs one Vectorize query,
made only when their interests change or the catalog changed and the ranking is
older than FEED_REFRESH_HOURS. Feed reads serve the cached ranking from D1.
"""

import hashlib
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.storage.cloudflare import CloudStorage

TOP_K = 100  # Vectorize maximum when values and metadata are not returned.
PAGE_SIZE = 30
EMBED_BATCH = 100
SYNC_LIMIT = 500
MAX_EVENT_CHARS = 1000  # ~250 tokens keeps neurons low and fits bge's 512 limit.
MIN_SAVE_SECONDS = 30
MAX_SAVES_PER_DAY = 20
EMPTY_RETRY = timedelta(minutes=10)
PAIRS_PER_QUERY = 45  # D1 binds at most 100 parameters per statement.


def clean(value):
    return " ".join(str(value).split())


def event_text(event):
    tags = event.get("tags") if isinstance(event.get("tags"), dict) else {}
    parts = [
        event.get("title"),
        event.get("description") or event.get("summary"),
        (event.get("organizer") or {}).get("name"),
        *(
            tag
            for values in tags.values()
            if isinstance(values, list)
            for tag in values
        ),
    ]
    return " ".join(clean(part) for part in parts if part)[:MAX_EVENT_CHARS]


def profile_text(interests, about):
    text = "Interested in: " + ", ".join(interests) + "." if interests else ""
    return (text + " " + clean(about)).strip()


def epoch(value):
    return int(datetime.fromisoformat(value).timestamp())


def pairs(rows):
    """Row-value IN clause for (source,id) keys, chunked below D1's bind limit."""
    for start in range(0, len(rows), PAIRS_PER_QUERY):
        chunk = rows[start : start + PAIRS_PER_QUERY]
        yield (
            "(source,id) IN (VALUES " + ",".join("(?,?)" for _ in chunk) + ")",
            [value for source, event_id in chunk for value in (source, event_id)],
        )


class ForYouService:
    def __init__(self, storage: CloudStorage):
        self.storage = storage

    @staticmethod
    def cache_key(user_id):
        return "for-you:v1:" + user_id

    async def sync_catalog(self, now=None):
        """Cron: embed new upcoming events, drop vectors for past ones."""
        now = now or datetime.now(UTC)
        rows = await self.storage.rows(
            "SELECT source,id,starts_at,data FROM provider_events "
            "WHERE embedded_at IS NULL AND starts_at >= ? ORDER BY starts_at LIMIT ?",
            now.isoformat(),
            SYNC_LIMIT,
        )
        for start in range(0, len(rows), EMBED_BATCH):
            batch = rows[start : start + EMBED_BATCH]
            vectors = await self.storage.embed(
                [event_text(json.loads(row["data"])) for row in batch]
            )
            await self.storage.vector_upsert(
                [
                    {
                        "id": row["source"] + ":" + row["id"],
                        "values": vector,
                        "metadata": {"starts_at": epoch(row["starts_at"])},
                    }
                    for row, vector in zip(batch, vectors, strict=True)
                ]
            )
            await self.mark([(r["source"], r["id"]) for r in batch], now.isoformat())
        expired = await self.storage.rows(
            "SELECT source,id FROM provider_events WHERE embedded_at IS NOT NULL "
            "AND embedded_at <> 'removed' AND starts_at < ? LIMIT 1000",
            (now - timedelta(days=1)).isoformat(),
        )
        keys = [(row["source"], row["id"]) for row in expired]
        for start in range(0, len(keys), EMBED_BATCH):
            chunk = keys[start : start + EMBED_BATCH]
            await self.storage.vector_delete([s + ":" + i for s, i in chunk])
            await self.mark(chunk, "removed")
        # Removals need no refresh: the query filter already excludes past events.
        if rows:
            await self.storage.execute(
                "UPDATE feed_meta SET value=value+1 WHERE key='catalog_version'"
            )
        return {"embedded": len(rows), "removed": len(keys)}

    async def mark(self, keys, value):
        for clause, params in pairs(keys):
            await self.storage.execute(
                f"UPDATE provider_events SET embedded_at=? WHERE {clause}",
                value,
                *params,
            )

    async def row(self, user_id):
        rows = await self.storage.rows(
            "SELECT f.*, m.value AS current_version FROM user_feeds f "
            "JOIN feed_meta m ON m.key='catalog_version' WHERE f.user_id=?",
            user_id,
        )
        return rows[0] if rows else None

    async def rank(self, vector, now):
        matches = await self.storage.vector_query(vector, TOP_K, int(now.timestamp()))
        return [[vector_id, round(score, 4)] for vector_id, score in matches]

    @staticmethod
    def interests(row):
        if not row or (not json.loads(row["interests"]) and not row["about"]):
            return None
        return {
            "interests": json.loads(row["interests"]),
            "about": row["about"],
            "updated_at": row["updated_at"],
        }

    async def save_interests(self, user_id, interests, about="", now=None):
        now = now or datetime.now(UTC)
        seen, unique = set(), []
        for interest in map(clean, interests):
            if interest and interest.lower() not in seen:
                seen.add(interest.lower())
                unique.append(interest)
        about = clean(about)
        if not unique and not about:
            raise HTTPException(422, "Add at least one interest")
        text = profile_text(unique, about)
        digest = hashlib.sha256(text.encode()).hexdigest()
        row = await self.row(user_id)
        if row and row["text_hash"] == digest:
            return self.interests(row)
        day = now.date().isoformat()
        count = row["saves_count"] if row and row["saves_day"] == day else 0
        if (
            row
            and (now - datetime.fromisoformat(row["updated_at"])).total_seconds()
            < MIN_SAVE_SECONDS
        ):
            raise HTTPException(429, "Wait a few seconds before saving again")
        if count >= MAX_SAVES_PER_DAY:
            raise HTTPException(429, "Interest updates are limited to 20 per day")
        [vector] = await self.storage.embed([text])
        version = row["current_version"] if row else await self.catalog_version()
        ranked = await self.rank(vector, now)
        await self.storage.execute(
            "INSERT INTO user_feeds (user_id,interests,about,text_hash,embedding,"
            "catalog_version,ranked,computed_at,updated_at,saves_day,saves_count) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET "
            "interests=excluded.interests,about=excluded.about,"
            "text_hash=excluded.text_hash,embedding=excluded.embedding,"
            "catalog_version=excluded.catalog_version,ranked=excluded.ranked,"
            "computed_at=excluded.computed_at,updated_at=excluded.updated_at,"
            "saves_day=excluded.saves_day,saves_count=excluded.saves_count",
            user_id,
            json.dumps(unique),
            about,
            digest,
            json.dumps([round(x, 5) for x in vector]),
            version,
            json.dumps(ranked),
            now.isoformat(),
            now.isoformat(),
            day,
            count + 1,
        )
        await self.storage.cache.delete(self.cache_key(user_id))
        return {"interests": unique, "about": about, "updated_at": now.isoformat()}

    async def clear(self, user_id):
        # Keep only the save counters so clearing can't reset the rate limit.
        await self.storage.execute(
            "UPDATE user_feeds SET interests='[]',about='',text_hash='',"
            "embedding='[]',ranked='[]',computed_at=NULL WHERE user_id=?",
            user_id,
        )
        await self.storage.cache.delete(self.cache_key(user_id))

    async def catalog_version(self):
        rows = await self.storage.rows(
            "SELECT value FROM feed_meta WHERE key='catalog_version'"
        )
        return rows[0]["value"] if rows else 0

    async def page(self, user_id, offset=0, now=None, row=None):
        now = now or datetime.now(UTC)
        row = row or await self.row(user_id)
        if self.interests(row) is None:
            return None
        ranked = json.loads(row["ranked"])
        age = (
            now - datetime.fromisoformat(row["computed_at"])
            if row["computed_at"]
            else None
        )
        catalog_changed = row["catalog_version"] < row["current_version"] and (
            not ranked
            or age is None
            or age >= timedelta(hours=self.storage.feed_refresh_hours)
        )
        # Vectorize indexes upserts asynchronously, so an empty ranking taken right
        # after a sync is retried on a short timer instead of waiting for the next one.
        retry_empty = (
            not ranked
            and row["current_version"] > 0
            and (age is None or age >= EMPTY_RETRY)
        )
        if catalog_changed or retry_empty:
            ranked = await self.rank(json.loads(row["embedding"]), now)
            await self.storage.execute(
                "UPDATE user_feeds SET ranked=?,catalog_version=?,computed_at=? "
                "WHERE user_id=?",
                json.dumps(ranked),
                row["current_version"],
                now.isoformat(),
                user_id,
            )
            row = {**row, "computed_at": now.isoformat()}
        window = ranked[offset : offset + PAGE_SIZE]
        return {
            "items": await self.hydrate([vector_id for vector_id, _ in window], now),
            "next_cursor": str(offset + PAGE_SIZE)
            if offset + PAGE_SIZE < len(ranked)
            else None,
            "personalized": True,
            "queries": [],
            "failedQueries": [],
            "failedProviders": [],
            "incomplete": False,
            "fetchedAt": row["computed_at"] or now.isoformat(),
        }

    async def hydrate(self, vector_ids, now):
        keys = [tuple(v.split(":", 1)) for v in vector_ids if ":" in v]
        found = {}
        for clause, params in pairs(keys):
            for row in await self.storage.rows(
                "SELECT source,id,data FROM provider_events "
                f"WHERE starts_at >= ? AND {clause}",
                now.replace(second=0, microsecond=0).isoformat(),
                *params,
            ):
                found[(row["source"], row["id"])] = json.loads(row["data"])
        # Keep Vectorize's rank order; events that started since ranking drop out.
        return [found[key] for key in keys if key in found]

    async def first_page(self, user_id):
        """Bootstrap slice; edge-cached per user so repeat app opens skip D1."""
        key = self.cache_key(user_id)
        cached = await self.storage.cache.get(key)
        if cached is not None:
            return cached
        row = await self.row(user_id)
        page = await self.page(user_id, row=row) if row else None
        result = {"for_you": page, "interests": self.interests(row) if page else None}
        await self.storage.cache.put(key, result, self.storage.event_ttl)
        return result
