"""Request-scoped D1 and Appwrite adapters with credential-free cache keys."""

import hashlib
import json
import logging
from urllib.parse import quote

from fastapi import HTTPException, Request


def js_options(value):
    from js import Object
    from pyodide.ffi import to_js

    return to_js(value, dict_converter=Object.fromEntries)


class EdgeCache:
    def __init__(self, origin: str):
        self.origin = origin.rstrip("/")

    def key(self, key):
        return (
            self.origin
            + "/__internal-cache/"
            + hashlib.sha256(key.encode()).hexdigest()
        )

    async def get(self, key):
        from js import caches

        try:
            response = await caches.default.match(self.key(key))
            return json.loads(await response.text()) if response else None
        except Exception:
            logging.getLogger(__name__).warning("Cache read unavailable")
            return None

    async def put(self, key, value, ttl):
        from js import Response, caches

        try:
            response = Response.new(
                json.dumps(value),
                js_options(
                    {
                        "headers": {
                            "Content-Type": "application/json",
                            "Cache-Control": f"max-age={ttl}",
                        }
                    }
                ),
            )
            await caches.default.put(self.key(key), response)
        except Exception:
            # A cache outage must not turn a committed profile/file write into failure.
            logging.getLogger(__name__).warning("Cache write unavailable")

    async def delete(self, key):
        from js import caches

        try:
            await caches.default.delete(self.key(key))
        except Exception:
            logging.getLogger(__name__).warning("Cache invalidation unavailable")


class CloudStorage:
    def __init__(self, env, origin):
        self.db = env.DB
        self.env = env
        self.cache = EdgeCache(origin)
        self.origin = origin.rstrip("/")
        self.profile_ttl = int(getattr(env, "PROFILE_CACHE_TTL", 60))
        self.event_ttl = int(getattr(env, "EVENT_CACHE_TTL", 300))
        self.feed_refresh_hours = int(getattr(env, "FEED_REFRESH_HOURS", 24))
        self.embed_model = getattr(env, "EMBED_MODEL", "@cf/baai/bge-small-en-v1.5")

    async def appwrite(
        self, method, path, *, data=None, content=None, mime=None, extra_headers=None
    ):
        import httpx

        from app.integrations.worker_http import worker_transport

        key = getattr(self.env, "APPWRITE_API_KEY", None)
        if not key:
            raise HTTPException(503, "Appwrite storage credentials are not configured")
        headers = {
            "X-Appwrite-Project": self.env.APPWRITE_PROJECT_ID,
            "X-Appwrite-Key": key,
        }
        if extra_headers:
            headers.update(extra_headers)
        filename = "upload." + {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "application/pdf": "pdf",
        }.get(mime, "bin")
        async with httpx.AsyncClient(
            transport=worker_transport(), timeout=15
        ) as client:
            kwargs = (
                {"json": data}
                if content is None
                else {"data": data, "files": {"file": (filename, content, mime)}}
            )
            response = await client.request(
                method,
                self.env.APPWRITE_ENDPOINT.rstrip("/") + path,
                headers=headers,
                **kwargs,
            )
        if response.is_error:
            try:
                kind = response.json().get("type", "unknown")
            except ValueError:
                kind = "unknown"
            if response.status_code == 404 and kind in {
                "row_not_found",
                "file_not_found",
            }:
                return None
            logging.getLogger(__name__).warning(
                "Appwrite storage returned status %s type %s",
                response.status_code,
                kind,
            )
            raise HTTPException(503, "Appwrite storage request failed")
        if response.status_code == 204:
            return {}
        return response.json() if content is None and "/view" not in path else response

    def profile_path(self, user_id):
        database = getattr(self.env, "APPWRITE_DATABASE_ID", "6aab47cd0031ba1570e2")
        table = getattr(self.env, "APPWRITE_PROFILES_TABLE_ID", "profiles")
        return (
            f"/tablesdb/{quote(database, safe='')}/tables/{quote(table, safe='')}"
            f"/rows/{quote(user_id, safe='')}"
        )

    def bucket(self, key):
        kind = key.split("/")[0]
        if kind == "avatars":
            return getattr(
                self.env, "APPWRITE_AVATARS_BUCKET_ID", "6aab6ee9001c14e2e84c"
            )
        if kind == "resumes":
            return getattr(
                self.env, "APPWRITE_RESUMES_BUCKET_ID", "6aab82cb000f96070a8e"
            )
        raise ValueError("Unknown file kind")

    async def rows(self, sql, *params):
        # The Workers SDK converts D1 results to Python mappings.
        result = await self.db.prepare(sql).bind(*params).all()
        return [dict(row) for row in result.results]

    async def execute(self, sql, *params):
        await self.db.prepare(sql).bind(*params).run()

    # The Workers SDK converts AI/Vectorize arguments and results to Python values.
    async def embed(self, texts):
        result = await self.env.AI.run(self.embed_model, {"text": list(texts)})
        return [[float(x) for x in vector] for vector in result["data"]]

    async def vector_upsert(self, items):
        await self.env.VECTORIZE.upsert(items)

    async def vector_query(self, vector, top_k, min_start):
        # IDs and scores only: topK may reach 100 without values or metadata.
        result = await self.env.VECTORIZE.query(
            vector,
            {
                "topK": top_k,
                "returnValues": False,
                "returnMetadata": "none",
                "filter": {"starts_at": {"$gte": min_start}},
            },
        )
        return [(match["id"], float(match["score"])) for match in result["matches"]]

    async def vector_delete(self, ids):
        await self.env.VECTORIZE.deleteByIds(list(ids))

    @staticmethod
    def profile_document(user_id, row):
        if row is None:
            return {"id": user_id}
        return {
            **{k: v for k, v in row.items() if not k.startswith("$")},
            "id": user_id,
            "name": row.get("name") or "",
            "bio": row.get("bio") or "",
            "onboarding_complete": bool(row.get("name")),
        }

    async def profile(self, user_id, fresh=False):
        key = "profile:" + user_id
        if not fresh:
            cached = await self.cache.get(key)
            if cached is not None:
                return cached
        row = await self.appwrite("GET", self.profile_path(user_id))
        value = self.profile_document(user_id, row)
        await self.cache.put(key, value, self.profile_ttl)
        return value

    async def update_profile(self, user_id, changes):
        previous = await self.profile(user_id, fresh=True)
        changes = dict(changes)
        changes.pop("onboarding_complete", None)
        if not previous.get("onboarding_complete"):
            changes.setdefault("name", previous.get("name") or "Community Member")
        # PATCH preserves independent edits without resupplying required columns.
        row = await self.appwrite(
            "PATCH" if previous.get("onboarding_complete") else "PUT",
            self.profile_path(user_id),
            data={"data": changes, "permissions": []},
        )
        if row is None:
            raise HTTPException(503, "Appwrite profiles table is not configured")
        updated = self.profile_document(user_id, row)
        await self.cache.put("profile:" + user_id, updated, self.profile_ttl)
        return previous, updated

    def avatar_url(self, file_id):
        bucket = self.bucket("avatars/")
        return (
            self.env.APPWRITE_ENDPOINT.rstrip("/")
            + f"/storage/buckets/{bucket}/files/{file_id}/view"
            + f"?project={self.env.APPWRITE_PROJECT_ID}"
        )

    async def put_file(self, key, content, mime):
        bucket = self.bucket(key)
        if key.startswith("resumes/"):
            config = await self.appwrite("GET", f"/storage/buckets/{bucket}")
            if config is None or config.get("$permissions"):
                raise HTTPException(503, "Resume storage must be private")
        size = len(content)
        # Appwrite requires multipart chunks for files larger than 5 MB.
        for start in range(0, size, 5_000_000):
            chunk = content[start : start + 5_000_000]
            headers = {}
            if size > 5_000_000:
                headers["Content-Range"] = (
                    f"bytes {start}-{start + len(chunk) - 1}/{size}"
                )
                if start:
                    headers["X-Appwrite-ID"] = key.split("/")[-1]
            result = await self.appwrite(
                "POST",
                f"/storage/buckets/{bucket}/files",
                data={"fileId": key.split("/")[-1]},
                content=chunk,
                mime=mime,
                extra_headers=headers,
            )
            if result is None:
                raise HTTPException(503, "Appwrite bucket is not configured")

    async def delete_file(self, key):
        if key:
            await self.appwrite(
                "DELETE",
                f"/storage/buckets/{self.bucket(key)}/files/"
                f"{quote(key.split('/')[-1], safe='')}",
            )

    async def file(self, key):
        response = await self.appwrite(
            "GET",
            f"/storage/buckets/{self.bucket(key)}/files/"
            f"{quote(key.split('/')[-1], safe='')}/view",
        )
        if response is None:
            raise HTTPException(404, "File not found")
        return response.content, response.headers.get(
            "Content-Type", "application/octet-stream"
        )


async def get_storage(request: Request) -> CloudStorage:
    env = request.scope.get("env")
    if env is None:
        raise HTTPException(
            503, "Cloudflare bindings unavailable; run uv run pywrangler dev"
        )
    return CloudStorage(env, str(request.base_url))
