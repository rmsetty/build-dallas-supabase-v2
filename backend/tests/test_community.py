"""Privacy, storage mutation, pagination, bootstrap caching and migration contracts."""

import json

import pytest

AUTH = {"Authorization": "Bearer alice"}
BOB = {"Authorization": "Bearer bob"}
EVENT = {
    "title": "Build Dallas",
    "starts_at": "2099-01-01T12:00:00-06:00",
    "ends_at": "2099-01-01T13:00:00-06:00",
    "location": {
        "label": "Secret office",
        "area": "Dallas",
        "address": "123 Private Rd",
    },
    "hide_exact_location": True,
}


def profile(client, headers=AUTH):
    response = client.put(
        "/v1/users/me/profile",
        headers=headers,
        json={"name": "Alice", "bio": "Builder"},
    )
    assert response.status_code == 200
    return response.json()


def test_auth_proxy_removed_and_profiles_protected(client):
    assert (
        client.post("/v1/auth/email/otp", json={"email": "a@example.com"}).status_code
        == 404
    )
    assert client.get("/v1/users/me").status_code == 401
    assert (
        client.get(
            "/v1/users/me", headers={"Authorization": "Bearer invalid"}
        ).status_code
        == 401
    )
    assert (
        client.get("/v1/users/me", headers=AUTH).json()["profile"][
            "onboarding_complete"
        ]
        is False
    )
    profile(client)
    assert client.get("/v1/users/me", headers=AUTH).json()["profile"]["name"] == "Alice"
    assert client.get("/v1/users/me", headers=BOB).json()["profile"]["name"] == ""


def test_event_creation_privacy_and_private_host_data(client):
    assert client.post("/v1/events", headers=AUTH, json=EVENT).status_code == 409
    profile(client)
    resume = client.post(
        "/v1/users/me/resume",
        headers=AUTH,
        files={"file": ("resume.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
    )
    assert resume.status_code == 200
    event = client.post("/v1/events", headers=AUTH, json=EVENT).json()
    url = "/v1/events/" + event["id"]
    public = client.get(url).json()
    assert public["location"] == {
        "label": "Dallas",
        "area": "Dallas",
        "address": None,
        "latitude": None,
        "longitude": None,
        "instructions": None,
    }
    assert "resume_file_id" not in public["host"]
    assert (
        client.get(url, headers=AUTH).json()["location"]["address"] == "123 Private Rd"
    )
    assert client.get(url, headers=BOB).json()["location"]["address"] is None
    private = client.post(
        "/v1/events", headers=AUTH, json={**EVENT, "visibility": "private"}
    ).json()
    assert client.get("/v1/events/" + private["id"]).status_code == 404
    assert client.get("/v1/events/" + private["id"], headers=BOB).status_code == 404
    assert len(client.get("/v1/events/mine", headers=AUTH).json()["items"]) == 2
    assert len(client.get("/v1/events", headers=BOB).json()["items"]) == 1
    assert client.get("/v1/users/me/resume", headers=BOB).status_code == 404


def test_avatar_and_resume_cleanup_and_validation(client, storage):
    profile(client)
    for content, mime in [
        (b"bad", "text/plain"),
        (b"<svg/>", "image/svg+xml"),
        (b"", "image/png"),
    ]:
        assert (
            client.post(
                "/v1/users/me/avatar",
                headers=AUTH,
                files={"file": ("a", content, mime)},
            ).status_code
            == 400
        )
    for _ in range(2):
        result = client.post(
            "/v1/users/me/avatar",
            headers=AUTH,
            files={"file": ("avatar.png", b"png-data", "image/png")},
        )
        assert result.status_code == 200
        assert len(storage.files) == 1
    assert client.get(result.json()["avatar_url"]).status_code == 200
    for _ in range(2):
        result = client.post(
            "/v1/users/me/resume",
            headers=AUTH,
            files={"file": ("../resume.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
        )
        assert result.status_code == 200
        assert len(storage.files) == 2
    profile(client)
    assert client.get("/v1/users/me", headers=AUTH).json()["profile"]["resume_file_id"]
    assert (
        client.get("/v1/users/me/resume", headers=AUTH).headers["cache-control"]
        == "no-store"
    )
    assert (
        client.post(
            "/v1/users/me/resume", headers=AUTH, files={"file": ("a.pdf", b"bad")}
        ).status_code
        == 400
    )
    assert client.delete("/v1/users/me/avatar", headers=AUTH).status_code == 200
    assert client.delete("/v1/users/me/resume", headers=AUTH).status_code == 200
    assert not storage.files


def test_event_pagination_ties_and_cursor_scope(client):
    profile(client)
    ids = {
        client.post("/v1/events", headers=AUTH, json=EVENT).json()["id"]
        for _ in range(3)
    }
    seen = set()
    cursor = None
    while True:
        result = client.get(
            "/v1/events", params={"limit": 1, **({"cursor": cursor} if cursor else {})}
        ).json()
        seen.update(event["id"] for event in result["items"])
        cursor = result["next_cursor"]
        if not cursor:
            break
    assert seen == ids
    assert (
        client.get(
            "/v1/events/mine", headers=BOB, params={"cursor": next(iter(ids))}
        ).status_code
        == 400
    )


def test_bootstrap_cache_avoids_database_reads_and_never_leaks_identity(
    client, storage
):
    storage.seed()
    profile(client)
    first = client.get("/v1/bootstrap", headers=AUTH)
    assert first.status_code == 200
    assert first.json()["user"]["id"] == "alice"
    assert len(first.json()["home"]["items"]) == 12
    assert first.headers["cache-control"] == "private, no-store"
    reads = storage.reads
    bob = client.get("/v1/bootstrap", headers=BOB).json()
    assert bob["user"]["id"] == "bob"
    assert bob["for_you"] is None and bob["interests"] is None
    # Shared catalog is cached; only Bob's own For You row is read, once.
    assert storage.reads == reads + 1
    client.get("/v1/bootstrap", headers=BOB)
    anonymous = client.get("/v1/bootstrap").json()
    assert anonymous["user"] is None
    assert anonymous["for_you"] is None
    assert storage.reads == reads + 1
    assert (
        client.get(
            "/v1/bootstrap", headers={"Authorization": "Bearer invalid"}
        ).status_code
        == 401
    )
    profile(client)
    assert (
        client.get("/v1/bootstrap", headers=AUTH).json()["user"]["profile"]["bio"]
        == "Builder"
    )


def test_catalog_pagination_search_detail_and_invalid_cursor(client, storage):
    storage.seed()
    seen = []
    cursor = None
    while True:
        response = client.get(
            "/v1/catalog/events",
            params={"limit": 5, **({"cursor": cursor} if cursor else {})},
        )
        assert response.status_code == 200
        data = response.json()
        seen.extend((item["source"], item["id"]) for item in data["items"])
        cursor = data["next_cursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) == 12
    assert client.get("/v1/catalog/events?cursor=not-a-cursor").status_code == 400
    assert len(client.get("/v1/catalog/events?query=Founder%201").json()["items"]) == 3
    assert client.get("/v1/catalog/events?query=%25").json()["items"] == []
    assert client.get("/v1/luma/events/luma1").json()["source"] == "luma"
    assert client.get("/v1/luma/events/missing").status_code == 404
    # No provider queries are exposed on the Worker.
    assert client.get("/v1/luma/discover").status_code == 404


@pytest.mark.parametrize(
    "value", ["https://evil.com/in/a", "https://linkedin.com/company/a"]
)
def test_linkedin_validation(client, value):
    assert (
        client.put(
            "/v1/users/me/profile",
            headers=AUTH,
            json={"name": "Alice", "linkedin_url": value},
        ).status_code
        == 422
    )


def test_seed_sql_idempotent_and_quoted_data(storage):
    from app.scripts.seed_events import snapshot_sql

    snapshot = [
        {
            "source": "luma",
            "fetched_at": "2099-01-01T00:00:00+00:00",
            "incomplete": False,
            "records": [
                {
                    "startup": True,
                    "event": {
                        "id": "evt-test",
                        "source": "luma",
                        "title": "Founder's event",
                        "startAt": "2099-01-01T10:00:00-06:00",
                    },
                }
            ],
        }
    ]
    sql = snapshot_sql(snapshot)
    storage.db.executescript(sql)
    storage.db.executescript(sql)
    rows = storage.db.execute("SELECT data FROM provider_events").fetchall()
    assert len(rows) == 1
    assert json.loads(rows[0]["data"])["title"] == "Founder's event"
