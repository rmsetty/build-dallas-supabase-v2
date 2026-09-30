"""Comprehensive test suite for the unofficial Luma API integration."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.core.config import settings
from app.integrations.luma.client import LumaClient
from app.integrations.luma.errors import (
    LumaEventNotFoundError,
    LumaParseError,
    LumaPlaceNotFoundError,
    LumaRateLimitError,
)
from app.integrations.luma.normalize import normalize_luma_event
from app.integrations.luma.place_resolver import LumaPlaceResolver, extract_next_data
from app.integrations.luma.schemas import LumaDiscoverPlace, NormalizedLumaEvent
from app.integrations.luma.service import LumaService, TTLCache
from fastapi.testclient import TestClient

from tests.provider_app import app

DALLAS_NEXT_DATA_HTML = """
<!DOCTYPE html>
<html>
<head><title>Dallas Events</title></head>
<body>
<script id="__NEXT_DATA__" type="application/json">
{
  "props": {
    "pageProps": {
      "initialData": {
        "kind": "discover-place",
        "data": {
          "place": {
            "api_id": "discplace-Ez9iuaZfs6AZDls",
            "slug": "dallas",
            "name": "Dallas",
            "timezone": "America/Chicago",
            "coordinate": {
              "latitude": 32.7935,
              "longitude": -96.7667
            }
          }
        }
      }
    }
  }
}
</script>
</body>
</html>
"""

NON_PLACE_NEXT_DATA_HTML = """
<!DOCTYPE html>
<html>
<body>
<script id="__NEXT_DATA__" type="application/json">
{
  "props": {
    "pageProps": {
      "initialData": {
        "kind": "calendar",
        "data": {}
      }
    }
  }
}
</script>
</body>
</html>
"""

SAMPLE_PUBLIC_EVENT = {
    "api_id": "evt-pub123",
    "event": {
        "api_id": "evt-pub123",
        "name": "Public AI Summit",
        "url": "ai-summit-2026",
        "cover_url": "https://images.lumacdn.com/uploads/cover.jpg",
        "social_image_url": "https://images.lumacdn.com/social.png",
        "start_at": "2026-10-15T18:00:00.000Z",
        "end_at": "2026-10-15T21:00:00.000Z",
        "timezone": "America/Chicago",
        "location_type": "offline",
        "visibility": "public",
        "geo_address_visibility": "public",
        "geo_address_info": {
            "mode": "shown",
            "address": "Dallas Innovation Hub",
            "full_address": "123 Main St, Dallas, TX 75201, USA",
            "city": "Dallas",
            "region": "Texas",
            "country": "United States",
            "country_code": "US",
            "place_coordinate": {"latitude": 32.78, "longitude": -96.80},
        },
        "coordinate": {"latitude": 32.78, "longitude": -96.80},
    },
    "calendar": {
        "api_id": "cal-123",
        "name": "Dallas Tech",
        "slug": "dallastech",
        "avatar_url": "https://cdn.lu.ma/cal.png",
    },
    "hosts": [
        {
            "api_id": "usr-1",
            "name": "Alice",
            "username": "alice",
            "bio_short": "Founder",
            "website": "https://alice.dev",
            "twitter_handle": "alice_tech",
        }
    ],
    "guest_count": 50,
    "ticket_count": 50,
    "ticket_info": {
        "is_free": True,
        "is_sold_out": False,
        "spots_remaining": 10,
        "require_approval": False,
    },
}

SAMPLE_RESTRICTED_EVENT = {
    "api_id": "evt-priv456",
    "event": {
        "api_id": "evt-priv456",
        "name": "Secret Founders Dinner",
        "url": "founders-dinner",
        "cover_url": "https://images.lumacdn.com/uploads/dinner.jpg",
        "start_at": "2026-11-01T19:00:00.000Z",
        "end_at": "2026-11-01T22:00:00.000Z",
        "timezone": "America/Chicago",
        "location_type": "offline",
        "visibility": "public",
        "geo_address_visibility": "guests-only",
        "geo_address_info": {
            "mode": "obfuscated",
            "city": "McKinney",
            "city_state": "McKinney, TX",
            "region": "Texas",
            "country": "United States",
            "country_code": "US",
        },
        "coordinate": {"latitude": 33.19, "longitude": -96.63},
    },
    "ticket_info": {
        "is_free": False,
        "price": 75.0,
        "currency": "USD",
        "is_sold_out": True,
        "spots_remaining": 0,
        "require_approval": True,
    },
}


# --- Unit Tests: Place Resolution & HTML Parsing ---


def test_extract_next_data_success():
    data = extract_next_data(DALLAS_NEXT_DATA_HTML)
    place = data["props"]["pageProps"]["initialData"]["data"]["place"]
    assert place["api_id"] == "discplace-Ez9iuaZfs6AZDls"
    assert place["slug"] == "dallas"


def test_extract_next_data_missing_script():
    with pytest.raises(LumaParseError, match="Could not find __NEXT_DATA__"):
        extract_next_data("<html><body><h1>No data</h1></body></html>")


def test_extract_next_data_invalid_json():
    with pytest.raises(LumaParseError, match="Failed to decode __NEXT_DATA__ JSON"):
        extract_next_data(
            '<script id="__NEXT_DATA__" type="application/json">{invalid json}</script>'
        )


@pytest.mark.anyio
async def test_resolve_place_success():
    client = LumaClient()
    client.fetch_place_html = AsyncMock(return_value=DALLAS_NEXT_DATA_HTML)
    resolver = LumaPlaceResolver(client)

    place = await resolver.resolve("dallas")
    assert isinstance(place, LumaDiscoverPlace)
    assert place.id == "discplace-Ez9iuaZfs6AZDls"
    assert place.slug == "dallas"
    assert place.name == "Dallas"
    assert place.timezone == "America/Chicago"
    assert place.latitude == 32.7935
    assert place.longitude == -96.7667


@pytest.mark.anyio
async def test_resolve_place_non_discover_kind():
    client = LumaClient()
    client.fetch_place_html = AsyncMock(return_value=NON_PLACE_NEXT_DATA_HTML)
    resolver = LumaPlaceResolver(client)

    with pytest.raises(LumaPlaceNotFoundError, match="Page is not a discover place"):
        await resolver.resolve("not-a-city")


@pytest.mark.anyio
async def test_resolve_place_empty_slug():
    client = LumaClient()
    resolver = LumaPlaceResolver(client)
    with pytest.raises(LumaPlaceNotFoundError, match="Empty slug"):
        await resolver.resolve("   ")


# --- Unit Tests: Event Normalization & Privacy Boundary ---


def test_normalize_public_event():
    event = normalize_luma_event(SAMPLE_PUBLIC_EVENT)
    assert isinstance(event, NormalizedLumaEvent)
    assert event.id == "evt-pub123"
    assert event.title == "Public AI Summit"
    assert event.url == "https://luma.com/ai-summit-2026"
    assert event.location.visibility == "public"
    assert event.location.venue_name == "Dallas Innovation Hub"
    assert event.location.address == "123 Main St, Dallas, TX 75201, USA"
    assert event.location.city == "Dallas"
    assert event.location.latitude == 32.78
    assert event.location.longitude == -96.80
    assert event.organizer is not None
    assert event.organizer.name == "Dallas Tech"
    assert len(event.hosts) == 1
    assert event.hosts[0].name == "Alice"
    assert event.tickets.is_free is True
    assert event.tickets.is_sold_out is False


def test_normalize_restricted_event_privacy_boundary():
    event = normalize_luma_event(SAMPLE_RESTRICTED_EVENT)
    assert event.id == "evt-priv456"
    assert event.title == "Secret Founders Dinner"
    assert event.location.visibility == "restricted"
    # Strict privacy: venue, exact address, and coordinates stripped to None
    assert event.location.venue_name is None
    assert event.location.address is None
    assert event.location.latitude is None
    assert event.location.longitude is None
    # Coarse city/region retained
    assert event.location.city == "McKinney"
    assert event.location.region == "Texas"
    assert event.tickets.is_free is False
    assert event.tickets.price == 75.0
    assert event.tickets.is_sold_out is True
    assert event.tickets.require_approval is True


def test_normalize_online_event():
    online_raw = {
        "api_id": "evt-online789",
        "event": {
            "name": "Global Virtual Hackathon",
            "location_type": "online",
            "start_at": "2026-12-01T00:00:00.000Z",
        },
    }
    event = normalize_luma_event(online_raw)
    assert event.id == "evt-online789"
    assert event.location_type == "online"
    assert event.location.latitude is None
    assert event.location.longitude is None
    assert event.location.venue_name is None


def test_normalize_defensive_empty_entry():
    empty_event = normalize_luma_event({})
    assert empty_event.id == ""
    assert empty_event.title == "Untitled Event"
    assert empty_event.location.visibility == "unknown"
    assert empty_event.hosts == []
    assert empty_event.organizer is None


# --- Unit Tests: TTL Cache & Coalescing ---


@pytest.mark.anyio
async def test_ttl_cache_expiration():
    cache = TTLCache()
    await cache.set("test_key", "value1", ttl_seconds=0.01)
    val = await cache.get("test_key")
    assert val == "value1"

    import asyncio

    await asyncio.sleep(0.02)
    val_expired = await cache.get("test_key")
    assert val_expired is None


@pytest.mark.anyio
async def test_request_coalescing():
    service = LumaService()
    call_count = 0

    async def mock_fetch():
        nonlocal call_count
        call_count += 1
        import asyncio

        await asyncio.sleep(0.05)
        return "result_data"

    import asyncio

    res1, res2 = await asyncio.gather(
        service._coalesce("key1", mock_fetch),
        service._coalesce("key1", mock_fetch),
    )
    assert res1 == "result_data"
    assert res2 == "result_data"
    assert call_count == 1


# --- Unit Tests: LumaClient Retries ---


@pytest.mark.anyio
async def test_client_retry_on_429():
    mock_responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "0"},
            request=httpx.Request("GET", "https://api.luma.com/test"),
        ),
        httpx.Response(
            200,
            json={"entries": [], "has_more": False},
            request=httpx.Request("GET", "https://api.luma.com/test"),
        ),
    ]

    mock_client = AsyncMock()
    mock_client.request = AsyncMock(side_effect=mock_responses)

    luma_client = LumaClient(client=mock_client)
    res = await luma_client.get_paginated_events("discplace-123")
    assert res == {"entries": [], "has_more": False}
    assert mock_client.request.call_count == 2


@pytest.mark.anyio
async def test_client_non_retryable_404():
    mock_response = httpx.Response(
        404,
        request=httpx.Request("GET", "https://api.luma.com/event/get"),
    )
    mock_client = AsyncMock()
    mock_client.request = AsyncMock(return_value=mock_response)

    luma_client = LumaClient(client=mock_client)
    with pytest.raises(LumaEventNotFoundError):
        await luma_client.get_event("evt-nonexistent")
    assert mock_client.request.call_count == 1


# --- Integration Tests: FastAPI Endpoints ---


def test_api_events_auto_resolves_dallas():
    test_client = TestClient(app)

    mock_place = LumaDiscoverPlace(
        id="discplace-Ez9iuaZfs6AZDls",
        slug="dallas",
        name="Dallas",
        timezone="America/Chicago",
        latitude=32.7935,
        longitude=-96.7667,
    )

    with (
        patch(
            "app.integrations.luma.service.LumaService.resolve_place",
            new_callable=AsyncMock,
        ) as mock_resolve,
        patch(
            "app.integrations.luma.client.LumaClient.get_paginated_events",
            new_callable=AsyncMock,
        ) as mock_get_events,
    ):
        mock_resolve.return_value = mock_place
        mock_get_events.return_value = {
            "entries": [SAMPLE_PUBLIC_EVENT],
            "has_more": False,
            "next_cursor": None,
        }

        response = test_client.get(f"{settings.API_V1_STR}/luma/events?query=founder")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "events" in data
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == "evt-pub123"
        assert data["place"]["slug"] == "dallas"
        assert data["place"]["id"] == "discplace-Ez9iuaZfs6AZDls"

        # Verify automatic resolution to default city 'dallas'
        mock_resolve.assert_called_once_with("dallas")
        mock_get_events.assert_called_once_with(
            place_id="discplace-Ez9iuaZfs6AZDls",
            query="founder",
            limit=25,
            cursor=None,
        )


def test_api_get_event_by_id():
    test_client = TestClient(app)

    with patch(
        "app.integrations.luma.client.LumaClient.get_event",
        new_callable=AsyncMock,
    ) as mock_get:
        mock_get.return_value = SAMPLE_PUBLIC_EVENT

        response = test_client.get(f"{settings.API_V1_STR}/luma/events/evt-pub123")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "evt-pub123"
        assert data["title"] == "Public AI Summit"
        assert data["location"]["visibility"] == "public"
        assert data["location"]["city"] == "Dallas"


def test_api_get_place_by_slug():
    test_client = TestClient(app)

    mock_place = LumaDiscoverPlace(
        id="discplace-Ez9iuaZfs6AZDls",
        slug="dallas",
        name="Dallas",
        timezone="America/Chicago",
        latitude=32.7935,
        longitude=-96.7667,
    )

    with patch(
        "app.integrations.luma.service.LumaService.resolve_place",
        new_callable=AsyncMock,
    ) as mock_resolve:
        mock_resolve.return_value = mock_place

        response = test_client.get(f"{settings.API_V1_STR}/luma/places/dallas")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "discplace-Ez9iuaZfs6AZDls"
        assert data["slug"] == "dallas"
        assert data["name"] == "Dallas"


def test_api_place_not_found_returns_404():
    test_client = TestClient(app)

    with patch(
        "app.integrations.luma.service.LumaService.resolve_place",
        new_callable=AsyncMock,
    ) as mock_resolve:
        mock_resolve.side_effect = LumaPlaceNotFoundError("unknown-city")

        response = test_client.get(f"{settings.API_V1_STR}/luma/places/unknown-city")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


def test_api_rate_limited_returns_429_with_retry_after():
    test_client = TestClient(app)

    with patch(
        "app.integrations.luma.service.LumaService.get_events",
        new_callable=AsyncMock,
    ) as mock_events:
        mock_events.side_effect = LumaRateLimitError(retry_after=45.0)

        response = test_client.get(f"{settings.API_V1_STR}/luma/events")
        assert response.status_code == 429
        assert response.headers.get("Retry-After") == "45"


def test_money_objects_and_rich_description():
    raw = {
        "event": {"api_id": "evt-money", "name": "Paid event"},
        "ticket_info": {
            "price": {"cents": 1250, "currency": "usd", "is_flexible": False},
            "max_price": {"cents": 2500, "currency": "usd"},
            "is_free": False,
        },
        "description_mirror": {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Hello "},
                        {"type": "text", "text": "Dallas"},
                    ],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Join us."}],
                },
            ],
        },
    }
    event = normalize_luma_event(raw)
    assert event.tickets.price == 12.5
    assert event.tickets.max_price == 25
    assert event.tickets.currency == "usd"
    assert event.description == "Hello Dallas\n\nJoin us."
    assert event.model_dump(by_alias=True)["tickets"]["maxPrice"] == 25


def test_unknown_price_is_not_free():
    event = normalize_luma_event({"ticket_info": {"price": {"currency": "usd"}}})
    assert event.tickets.price is None
    assert event.tickets.is_free is None
