"""For You contracts: embed once, query rarely, never leak another user's feed."""

import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest
from app.scripts.seed_events import snapshot_sql
from app.services.for_you import ForYouService, event_text
from fastapi import HTTPException

AUTH = {"Authorization": "Bearer alice"}
BOB = {"Authorization": "Bearer bob"}
NOW = datetime(2026, 9, 22, tzinfo=UTC)


def add_event(storage, source, event_id, title, starts="2026-10-01T00:00:00+00:00"):
    data = {"id": event_id, "source": source, "startAt": starts, "title": title}
    storage.db.execute(
        "INSERT INTO provider_events (source,id,starts_at,startup,search_text,data,"
        "updated_at) VALUES (?,?,?,?,?,?,?)",
        (source, event_id, starts, 0, title.lower(), json.dumps(data), starts),
    )
    storage.db.commit()


def embedded_at(storage, source, event_id):
    return storage.db.execute(
        "SELECT embedded_at FROM provider_events WHERE source=? AND id=?",
        (source, event_id),
    ).fetchone()[0]


def version(storage):
    return storage.db.execute(
        "SELECT value FROM feed_meta WHERE key='catalog_version'"
    ).fetchone()[0]


def test_event_text_is_bounded_and_uses_topical_fields():
    text = event_text(
        {
            "title": "AI  Night",
            "summary": "Talks\non agents",
            "organizer": {"name": "Build Dallas"},
            "tags": {"categories": ["Science & Technology"], "formats": ["Meetup"]},
            "hosts": [{"name": "Private Person"}],
            "description": None,
        }
    )
    assert text == "AI Night Talks on agents Build Dallas Science & Technology Meetup"
    assert len(event_text({"title": "x" * 5000})) == 1000


@pytest.mark.asyncio
async def test_sync_embeds_upcoming_events_once_and_removes_past(storage):
    service = ForYouService(storage)
    add_event(storage, "luma", "a", "AI founders meetup")
    add_event(storage, "eventbrite", "b", "Pottery class", "2026-10-02T00:00:00+00:00")
    add_event(storage, "meetup", "old", "Old event", "2020-01-01T00:00:00+00:00")
    assert await service.sync_catalog(NOW) == {"embedded": 2, "removed": 0}
    assert set(storage.vectors) == {"luma:a", "eventbrite:b"}
    assert storage.vectors["luma:a"][1] == {"starts_at": 1790812800}
    assert embedded_at(storage, "meetup", "old") is None
    assert version(storage) == 1
    # Idempotent: no new neurons and no refresh signal when nothing changed.
    assert await service.sync_catalog(NOW) == {"embedded": 0, "removed": 0}
    assert len(storage.embedded_texts) == 2 and version(storage) == 1
    later = datetime(2026, 10, 2, 6, tzinfo=UTC)
    assert await service.sync_catalog(later) == {"embedded": 0, "removed": 1}
    assert set(storage.vectors) == {"eventbrite:b"}
    assert embedded_at(storage, "luma", "a") == "removed"
    assert version(storage) == 1


@pytest.mark.asyncio
async def test_reseed_only_reembeds_changed_events(storage):
    def snapshot(description):
        return [
            {
                "source": "luma",
                "fetched_at": "2026-09-22T00:00:00+00:00",
                "incomplete": False,
                "records": [
                    {
                        "startup": True,
                        "event": {
                            "id": event_id,
                            "title": "Founder night " + event_id,
                            "description": text,
                            "startAt": "2026-10-01T00:00:00Z",
                        },
                    }
                    for event_id, text in (("same", "Unchanged"), ("edit", description))
                ],
            }
        ]

    service = ForYouService(storage)
    storage.db.executescript(snapshot_sql(snapshot("First draft")))
    assert (await service.sync_catalog(NOW))["embedded"] == 2
    storage.db.executescript(snapshot_sql(snapshot("Second draft")))
    assert embedded_at(storage, "luma", "same") == NOW.isoformat()
    assert embedded_at(storage, "luma", "edit") is None
    assert (await service.sync_catalog(NOW))["embedded"] == 1


@pytest.mark.asyncio
async def test_interests_rank_dedupe_and_are_rate_limited(storage):
    service = ForYouService(storage)
    add_event(storage, "luma", "ml", "Machine learning founders meetup")
    add_event(storage, "eventbrite", "pot", "Pottery wheel class")
    add_event(storage, "meetup", "demo", "Startups machine learning demo day")
    await service.sync_catalog(NOW)
    saved = await service.save_interests(
        "alice", ["Machine learning", " machine  LEARNING ", "Startups"], "", NOW
    )
    assert saved["interests"] == ["Machine learning", "Startups"]
    assert storage.vector_queries == 1
    page = await service.page("alice", now=NOW)
    assert [e["id"] for e in page["items"]][-1] == "pot"
    assert {e["id"] for e in page["items"][:2]} == {"ml", "demo"}
    assert page["personalized"] and page["next_cursor"] is None
    embeds = len(storage.embedded_texts)
    # Unchanged text is a free no-op, even inside the rate-limit window.
    await service.save_interests("alice", ["Machine learning", "Startups"], "", NOW)
    assert len(storage.embedded_texts) == embeds
    with pytest.raises(HTTPException) as error:
        await service.save_interests("alice", ["Pottery"], "", NOW)
    assert error.value.status_code == 429
    moment = NOW
    for index in range(19):
        moment += timedelta(seconds=31)
        await service.save_interests("alice", [f"Topic {index}"], "", moment)
    with pytest.raises(HTTPException) as error:
        await service.save_interests(
            "alice", ["One more"], "", moment + timedelta(minutes=1)
        )
    assert "20 per day" in error.value.detail
    await service.save_interests("alice", ["Tomorrow"], "", NOW + timedelta(days=1))


@pytest.mark.asyncio
async def test_refresh_is_lazy_and_throttled(storage):
    service = ForYouService(storage)
    # Saving before any vectors exist yields an empty ranking...
    await service.save_interests("alice", ["Founders"], "", NOW)
    assert (await service.page("alice", now=NOW))["items"] == []
    add_event(storage, "luma", "one", "Founders breakfast")
    await service.sync_catalog(NOW)
    # ...which refreshes as soon as the catalog changes, ignoring the throttle.
    assert [e["id"] for e in (await service.page("alice", now=NOW))["items"]] == ["one"]
    queries = storage.vector_queries
    await service.page("alice", now=NOW + timedelta(hours=1))
    assert storage.vector_queries == queries
    add_event(storage, "meetup", "two", "Founders happy hour")
    await service.sync_catalog(NOW + timedelta(hours=1))
    page = await service.page("alice", now=NOW + timedelta(hours=2))
    assert storage.vector_queries == queries and len(page["items"]) == 1
    page = await service.page("alice", now=NOW + timedelta(hours=25))
    assert storage.vector_queries == queries + 1 and len(page["items"]) == 2
    await service.page("alice", now=NOW + timedelta(hours=26))
    assert storage.vector_queries == queries + 1


@pytest.mark.asyncio
async def test_empty_ranking_from_vectorize_lag_is_retried(storage):
    service = ForYouService(storage)
    add_event(storage, "luma", "one", "Founders breakfast")
    await service.sync_catalog(NOW)
    indexed, storage.vectors = storage.vectors, {}  # Upsert not yet queryable.
    await service.save_interests("alice", ["Founders"], "", NOW)
    assert (await service.page("alice", now=NOW))["items"] == []
    storage.vectors = indexed
    queries = storage.vector_queries
    # Same catalog version, but an empty ranking must not stick until the next sync.
    assert (await service.page("alice", now=NOW + timedelta(minutes=5)))["items"] == []
    assert storage.vector_queries == queries
    page = await service.page("alice", now=NOW + timedelta(minutes=11))
    assert [e["id"] for e in page["items"]] == ["one"]
    assert storage.vector_queries == queries + 1


def test_for_you_endpoints_validation_privacy_and_clear(client, storage):
    storage.seed()
    asyncio.run(ForYouService(storage).sync_catalog())
    assert client.get("/v1/events/for-you").status_code == 401
    assert client.get("/v1/events/for-you", headers=AUTH).status_code == 404
    for bad in (
        {"interests": ["x"] * 31},
        {"interests": ["x" * 41]},
        {"interests": ["   "]},
        {"interests": [], "about": ""},
        {"interests": ["AI"], "resume": "raw text"},
        {"interests": ["AI"], "about": "x" * 281},
    ):
        response = client.put("/v1/users/me/interests", headers=AUTH, json=bad)
        assert response.status_code == 422, bad
    saved = client.put(
        "/v1/users/me/interests", headers=AUTH, json={"interests": ["Founder"]}
    )
    assert saved.status_code == 200
    assert saved.json()["interests"] == ["Founder"]
    alice = client.get("/v1/bootstrap", headers=AUTH).json()
    assert alice["for_you"]["personalized"] is True
    assert len(alice["for_you"]["items"]) == 12
    assert alice["interests"]["interests"] == ["Founder"]
    bob = client.get("/v1/bootstrap", headers=BOB).json()
    assert bob["for_you"] is None and bob["interests"] is None
    page = client.get("/v1/events/for-you", headers=AUTH, params={"cursor": "0"})
    assert len(page.json()["items"]) == 12 and page.json()["next_cursor"] is None
    assert (
        client.get(
            "/v1/events/for-you", headers=AUTH, params={"cursor": "-1"}
        ).status_code
        == 422
    )
    assert client.delete("/v1/users/me/interests", headers=AUTH).status_code == 204
    assert client.get("/v1/bootstrap", headers=AUTH).json()["for_you"] is None
    assert client.get("/v1/events/for-you", headers=AUTH).status_code == 404
    # Clearing keeps the save counters, so it can't be used to dodge rate limits.
    again = client.put(
        "/v1/users/me/interests", headers=AUTH, json={"interests": ["Founder"]}
    )
    assert again.status_code == 429
