"""SQLite executes the exact D1 schema and queries; Appwrite is isolated."""

import copy
import hashlib
import json
import math
import re
import sqlite3
import time
from pathlib import Path

import pytest
from app.core.request_context import RequestContext, optional_context
from app.main import app
from app.storage.cloudflare import get_storage
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient


class MemoryCache:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        value = self.values.get(key)
        return copy.deepcopy(value[1]) if value and value[0] > time.time() else None

    async def put(self, key, value, ttl):
        self.values[key] = (time.time() + ttl, copy.deepcopy(value))

    async def delete(self, key):
        self.values.pop(key, None)


class MemoryStorage:
    origin = "http://testserver"
    profile_ttl = 60
    event_ttl = 300
    feed_refresh_hours = 24

    def __init__(self):
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        for migration in sorted(
            (Path(__file__).parents[1] / "migrations").glob("*.sql")
        ):
            self.db.executescript(migration.read_text())
        self.cache = MemoryCache()
        self.profiles = {}
        self.files = {}
        self.reads = 0
        self.vectors = {}
        self.embedded_texts = []
        self.vector_queries = 0

    async def embed(self, texts):
        # Deterministic bag-of-words stand-in for Workers AI bge embeddings.
        self.embedded_texts.extend(texts)
        vectors = []
        for text in texts:
            vector = [0.0] * 64
            for word in re.findall(r"[a-z0-9]+", text.lower()):
                vector[int(hashlib.md5(word.encode()).hexdigest(), 16) % 64] += 1
            norm = math.sqrt(sum(x * x for x in vector)) or 1
            vectors.append([x / norm for x in vector])
        return vectors

    async def vector_upsert(self, items):
        for item in items:
            self.vectors[item["id"]] = (item["values"], item["metadata"])

    async def vector_query(self, vector, top_k, min_start):
        self.vector_queries += 1
        scored = [
            (vector_id, sum(a * b for a, b in zip(vector, values)))
            for vector_id, (values, metadata) in self.vectors.items()
            if metadata["starts_at"] >= min_start
        ]
        return sorted(scored, key=lambda match: -match[1])[:top_k]

    async def vector_delete(self, ids):
        for vector_id in ids:
            self.vectors.pop(vector_id, None)

    async def rows(self, sql, *params):
        self.reads += 1
        return [dict(row) for row in self.db.execute(sql, params).fetchall()]

    async def execute(self, sql, *params):
        self.db.execute(sql, params)
        self.db.commit()

    async def profile(self, user_id, fresh=False):
        return copy.deepcopy(self.profiles.get(user_id, {"id": user_id}))

    async def update_profile(self, user_id, changes):
        previous = await self.profile(user_id)
        updated = {**previous, **changes}
        self.profiles[user_id] = updated
        return previous, updated

    def avatar_url(self, file_id):
        return self.origin + "/v1/avatars/alice/" + file_id

    def bucket(self, key):
        return key.split("/")[0]

    async def put_file(self, key, content, mime):
        self.files[key] = (content, mime)

    async def delete_file(self, key):
        self.files.pop(key, None)

    async def file(self, key):
        if key not in self.files:
            raise HTTPException(404, "File not found")
        return self.files[key]

    def seed(self):
        for source in ("luma", "eventbrite", "meetup"):
            for i in range(4):
                data = {
                    "id": f"{source}{i}",
                    "source": source,
                    "startAt": "2099-01-01T00:00:00Z",
                    "title": f"Founder {i}",
                }
                self.db.execute(
                    "INSERT INTO provider_events (source,id,starts_at,startup,"
                    "search_text,data,updated_at) VALUES (?,?,?,?,?,?,?)",
                    (
                        source,
                        data["id"],
                        "2099-01-01T00:00:00+00:00",
                        1,
                        data["title"].lower(),
                        json.dumps(data),
                        "2099-01-01T00:00:00+00:00",
                    ),
                )
            self.db.execute(
                "INSERT INTO ingestion_status VALUES (?,?,?)",
                (source, "2099-01-01T00:00:00+00:00", 0),
            )
        self.db.commit()


@pytest.fixture
def storage():
    value = MemoryStorage()
    yield value
    value.db.close()


@pytest.fixture
def client(storage):
    async def context(request: Request):
        token = request.headers.get("authorization")
        if not token:
            return None
        if token not in ("Bearer alice", "Bearer bob"):
            raise HTTPException(401, "Invalid token")
        user = token.split()[1]
        return RequestContext(user, user + "@example.com")

    async def bound_storage():
        return storage

    app.dependency_overrides[get_storage] = bound_storage
    app.dependency_overrides[optional_context] = context
    with TestClient(app) as result:
        yield result
    app.dependency_overrides.clear()


@pytest.fixture
def provider_client():
    from tests.provider_app import app as provider_app

    with TestClient(provider_app) as client:
        yield client
