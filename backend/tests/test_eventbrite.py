"""Comprehensive test suite for the unofficial Eventbrite API integration."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.core.config import settings
from app.integrations.eventbrite.bootstrap import (
    EventbriteBootstrapper,
    extract_csrf_token,
    extract_server_data,
)
from app.integrations.eventbrite.client import EventbriteClient
from app.integrations.eventbrite.errors import (
    EventbriteCSRFError,
    EventbriteParseError,
    EventbritePlaceNotFoundError,
    EventbriteRateLimitError,
)
from app.integrations.eventbrite.normalize import normalize_eventbrite_event
from app.integrations.eventbrite.schemas import (
    EventbriteBootstrap,
    NormalizedEventbriteEvent,
)
from app.integrations.eventbrite.service import EventbriteService
from fastapi.testclient import TestClient

from tests.provider_app import app

DALLAS_BOOTSTRAP_HTML = """
<!DOCTYPE html>
<html>
<head><title>Events in Dallas, TX</title></head>
<body>
<form>
  <input type="hidden" name="csrfmiddlewaretoken" value="test_csrf_token_12345" />
</form>
<script>
window.__SERVER_DATA__ = {
  "placeId": "101724385",
  "currentPlace": "Dallas",
  "place_type": "locality",
  "search_data": {
    "event_search": {
      "places": ["101724385"],
      "q": "tech"
    }
  }
};
window.__OTHER__ = {};
</script>
</body>
</html>
"""

RAW_EVENTBRITE_EVENT = {
    "id": "1997987482344",
    "eventbrite_event_id": "1997987482344",
    "name": "Dallas Tech Mixer 2026",
    "summary": "Premier networking event for Dallas tech innovators.",
    "url": "https://www.eventbrite.com/e/dallas-tech-mixer-2026-tickets-1997987482344",
    "start_date": "2026-10-08",
    "start_time": "19:00",
    "end_date": "2026-10-08",
    "end_time": "22:00",
    "timezone": "America/Chicago",
    "is_online_event": False,
    "image": {
        "url": "https://img.evbuc.com/fallback.jpg",
        "image_sizes": {
            "small": "https://img.evbuc.com/small.jpg",
            "medium": "https://img.evbuc.com/medium.jpg",
            "large": "https://img.evbuc.com/large.jpg",
        },
        "original": {"url": "https://img.evbuc.com/original.jpg"},
    },
    "primary_venue": {
        "id": "298756436",
        "name": "Nice Mezze Cocktail Bar",
        "address": {
            "address_1": "233 West Seventh Street",
            "address_2": "#Suite 120",
            "city": "Dallas",
            "region": "TX",
            "postal_code": "75208",
            "country": "US",
            "latitude": "32.7491068",
            "longitude": "-96.8254955",
            "localized_address_display": (
                "233 West Seventh Street #Suite 120, Dallas, TX 75208"
            ),
        },
    },
    "primary_organizer": {
        "id": "78679768873",
        "name": "Dallas Tech Mixer",
        "url": "https://www.eventbrite.com/o/dallas-tech-mixer-78679768873",
        "website_url": "https://dallastech.org",
        "summary": "Connecting technologists across North Texas.",
    },
    "ticket_availability": {
        "is_free": False,
        "has_available_tickets": True,
        "is_sold_out": False,
        "has_bogo_tickets": False,
        "minimum_ticket_price": {
            "currency": "USD",
            "value": 2500,
            "display": "25.00 USD",
        },
        "maximum_ticket_price": {
            "currency": "USD",
            "value": 5000,
            "display": "50.00 USD",
        },
    },
    "event_sales_status": {
        "sales_status": "on_sale",
        "currency": "USD",
    },
    "tags": [
        {"prefix": "EventbriteCategory", "display_name": "Science & Tech"},
        {"prefix": "EventbriteSubCategory", "display_name": "High Tech"},
        {"prefix": "EventbriteFormat", "display_name": "Networking"},
        {"prefix": "OrganizerTag", "display_name": "DallasTech"},
    ],
    "published": "2026-08-01T12:00:00Z",
}

RAW_PROMOTED_EVENT = {
    "id": "9999999999999",
    "name": "Promoted Sponsored Ad Event",
    "summary": "Should never be included in organic results",
}


# --- Unit Tests: Bootstrap Extraction ---


def test_extract_csrf_token_from_input():
    html = '<input type="hidden" name="csrfmiddlewaretoken" value="abc_csrf_123" />'
    assert extract_csrf_token(html) == "abc_csrf_123"


def test_extract_csrf_token_fallback_cookie():
    assert (
        extract_csrf_token("<html></html>", cookie_token="cookie_csrf_999")
        == "cookie_csrf_999"
    )


def test_extract_csrf_token_missing_raises():
    with pytest.raises(EventbriteCSRFError, match="Could not locate public CSRF token"):
        extract_csrf_token("<html><body>No tokens here</body></html>")


def test_extract_server_data_success():
    data = extract_server_data(DALLAS_BOOTSTRAP_HTML)
    assert data["placeId"] == "101724385"
    assert data["currentPlace"] == "Dallas"


def test_extract_server_data_missing_raises():
    with pytest.raises(
        EventbriteParseError, match="Could not find window.__SERVER_DATA__"
    ):
        extract_server_data("<html><body><h1>Welcome</h1></body></html>")


@pytest.mark.anyio
async def test_bootstrapper_success():
    mock_client = EventbriteClient()
    mock_client.fetch_discovery_page = AsyncMock(
        return_value=(DALLAS_BOOTSTRAP_HTML, "cookie_val")
    )
    bootstrapper = EventbriteBootstrapper(mock_client)

    bootstrap = await bootstrapper.bootstrap("tx--dallas")
    assert isinstance(bootstrap, EventbriteBootstrap)
    assert bootstrap.place_id == "101724385"
    assert bootstrap.place_name == "Dallas"
    assert bootstrap.place_type == "locality"
    assert bootstrap.csrf_token == "test_csrf_token_12345"
    assert bootstrap.csrf_cookie == "cookie_val"


@pytest.mark.anyio
async def test_bootstrapper_missing_place_id_raises():
    invalid_html = """
    <input type="hidden" name="csrfmiddlewaretoken" value="tok" />
    <script>window.__SERVER_DATA__ = {"placeId": null};</script>
    """
    mock_client = EventbriteClient()
    mock_client.fetch_discovery_page = AsyncMock(return_value=(invalid_html, None))
    bootstrapper = EventbriteBootstrapper(mock_client)

    with pytest.raises(EventbritePlaceNotFoundError):
        await bootstrapper.bootstrap("unknown-slug")


# --- Unit Tests: Event Normalization ---


def test_normalize_eventbrite_event_full():
    event = normalize_eventbrite_event(RAW_EVENTBRITE_EVENT)
    assert isinstance(event, NormalizedEventbriteEvent)
    assert event.source == "eventbrite"
    assert event.id == "1997987482344"
    assert event.title == "Dallas Tech Mixer 2026"
    assert event.url == RAW_EVENTBRITE_EVENT["url"]
    assert "2026-10-08T19:00:00" in event.start_at
    assert event.timezone == "America/Chicago"

    # Image priority (large > medium > small)
    assert event.image_url == "https://img.evbuc.com/large.jpg"
    assert event.image_large_url == "https://img.evbuc.com/large.jpg"
    assert event.image_small_url == "https://img.evbuc.com/small.jpg"

    # Venue & coordinates
    assert event.venue is not None
    assert event.venue.name == "Nice Mezze Cocktail Bar"
    assert event.venue.city == "Dallas"
    assert event.venue.latitude == 32.7491068
    assert event.venue.longitude == -96.8254955

    # Organizer
    assert event.organizer is not None
    assert event.organizer.name == "Dallas Tech Mixer"
    assert event.organizer.website_url == "https://dallastech.org"

    # Tags segregation
    assert "Science & Tech" in event.tags.categories
    assert "High Tech" in event.tags.subcategories
    assert "Networking" in event.tags.formats
    assert "DallasTech" in event.tags.organizer_tags

    # Tickets minor units
    assert event.tickets.is_free is False
    assert event.tickets.minimum_price_minor == 2500
    assert event.tickets.maximum_price_minor == 5000
    assert event.tickets.currency == "USD"


def test_normalize_eventbrite_defensive_empty():
    event = normalize_eventbrite_event({})
    assert event.id == ""
    assert event.title == "Untitled Event"
    assert event.venue is None
    assert event.organizer is None
    assert event.tags.categories == []
    assert event.tickets.is_free is None


# --- Unit Tests: Client Retries & CSRF ---


@pytest.mark.anyio
async def test_client_retry_on_429():
    mock_responses = [
        httpx.Response(
            429,
            headers={"Retry-After": "0"},
            request=httpx.Request("POST", "https://www.eventbrite.com/search"),
        ),
        httpx.Response(
            200,
            json={"events": {"results": [], "pagination": {}}},
            request=httpx.Request("POST", "https://www.eventbrite.com/search"),
        ),
    ]
    mock_client = AsyncMock()
    mock_client.request = AsyncMock(side_effect=mock_responses)

    eb_client = EventbriteClient(client=mock_client)
    res = await eb_client.search_destination("101724385", query="tech")
    assert "events" in res
    assert mock_client.request.call_count == 2


@pytest.mark.anyio
async def test_client_raises_csrf_error_on_403():
    mock_response = httpx.Response(
        403,
        request=httpx.Request("POST", "https://www.eventbrite.com/search"),
    )
    mock_client = AsyncMock()
    mock_client.request = AsyncMock(return_value=mock_response)

    eb_client = EventbriteClient(client=mock_client)
    with pytest.raises(EventbriteCSRFError):
        await eb_client.search_destination("101724385")


# --- Unit Tests: Service Layer, Caching & Promoted Ad Exclusion ---


@pytest.mark.anyio
async def test_service_strict_promoted_ad_isolation():
    mock_bootstrap = EventbriteBootstrap(
        place_id="101724385",
        place_name="Dallas",
        location_slug="tx--dallas",
        csrf_token="tok123",
        fetched_at="2026-09-17T00:00:00Z",
    )

    mock_search_data = {
        "events": {
            "results": [RAW_EVENTBRITE_EVENT],
            "promoted_results": [RAW_PROMOTED_EVENT],
            "pagination": {
                "page_number": 1,
                "page_size": 20,
                "page_count": 5,
                "object_count": 100,
            },
        }
    }

    mock_client = EventbriteClient()
    mock_client.search_destination = AsyncMock(return_value=mock_search_data)

    service = EventbriteService(client=mock_client)
    service.get_bootstrap = AsyncMock(return_value=mock_bootstrap)

    page = await service.get_events(location="tx--dallas", query="tech")

    # Strict requirement: only the 1 organic event is present;
    # promoted event is excluded
    assert len(page.events) == 1
    assert page.events[0].id == "1997987482344"
    assert page.pagination.page == 1
    assert page.pagination.page_count == 5


@pytest.mark.anyio
async def test_service_csrf_refresh_retry_on_403():
    mock_bootstrap_1 = EventbriteBootstrap(
        place_id="101724385",
        location_slug="tx--dallas",
        csrf_token="stale_token",
        fetched_at="2026-09-17T00:00:00Z",
    )
    mock_bootstrap_2 = EventbriteBootstrap(
        place_id="101724385",
        location_slug="tx--dallas",
        csrf_token="fresh_token",
        fetched_at="2026-09-17T00:00:01Z",
    )

    mock_client = EventbriteClient()
    mock_client.search_destination = AsyncMock(
        side_effect=[
            EventbriteCSRFError("Token expired"),
            {"events": {"results": [RAW_EVENTBRITE_EVENT], "pagination": {}}},
        ]
    )

    service = EventbriteService(client=mock_client)
    service.get_bootstrap = AsyncMock(side_effect=[mock_bootstrap_1, mock_bootstrap_2])

    page = await service.get_events(location="tx--dallas")
    assert len(page.events) == 1
    assert mock_client.search_destination.call_count == 2


@pytest.mark.anyio
async def test_service_caching_and_coalescing():
    service = EventbriteService()
    call_count = 0

    async def mock_call():
        nonlocal call_count
        call_count += 1
        import asyncio

        await asyncio.sleep(0.02)
        return "cached_value"

    import asyncio

    res1, res2 = await asyncio.gather(
        service._coalesce("key_eb", mock_call),
        service._coalesce("key_eb", mock_call),
    )
    assert res1 == "cached_value"
    assert res2 == "cached_value"
    assert call_count == 1


# --- Integration Tests: FastAPI Endpoints ---


def test_api_list_events_default_location():
    test_client = TestClient(app)

    mock_bootstrap = EventbriteBootstrap(
        place_id="101724385",
        place_name="Dallas",
        location_slug="tx--dallas",
        csrf_token="csrf_123",
        fetched_at="2026-09-17T00:00:00Z",
    )

    with (
        patch(
            "app.integrations.eventbrite.service.EventbriteService.get_bootstrap",
            new_callable=AsyncMock,
        ) as mock_boot,
        patch(
            "app.integrations.eventbrite.client.EventbriteClient.search_destination",
            new_callable=AsyncMock,
        ) as mock_search,
    ):
        mock_boot.return_value = mock_bootstrap
        mock_search.return_value = {
            "events": {
                "results": [RAW_EVENTBRITE_EVENT],
                "promoted_results": [RAW_PROMOTED_EVENT],
                "pagination": {"page_number": 1, "page_size": 20, "page_count": 1},
            }
        }

        # Query without specifying location -> should default to tx--dallas
        response = test_client.get(
            f"{settings.API_V1_STR}/eventbrite/events?query=tech"
        )
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert "items" in data
        assert len(data["events"]) == 1
        assert data["events"][0]["id"] == "1997987482344"
        assert data["place"]["locationSlug"] == "tx--dallas"
        assert data["place"]["placeId"] == "101724385"

        mock_boot.assert_called_once_with("tx--dallas")


def test_api_get_place_by_slug():
    test_client = TestClient(app)

    mock_bootstrap = EventbriteBootstrap(
        place_id="101724389",
        place_name="Plano",
        place_type="locality",
        location_slug="tx--plano",
        csrf_token="csrf_plano",
        fetched_at="2026-09-17T00:00:00Z",
    )

    with patch(
        "app.integrations.eventbrite.service.EventbriteService.get_bootstrap",
        new_callable=AsyncMock,
    ) as mock_boot:
        mock_boot.return_value = mock_bootstrap

        response = test_client.get(f"{settings.API_V1_STR}/eventbrite/places/tx--plano")
        assert response.status_code == 200
        data = response.json()
        assert data["placeId"] == "101724389"
        assert data["placeName"] == "Plano"
        assert data["locationSlug"] == "tx--plano"


def test_api_place_not_found_returns_404():
    test_client = TestClient(app)

    with patch(
        "app.integrations.eventbrite.service.EventbriteService.get_bootstrap",
        new_callable=AsyncMock,
    ) as mock_boot:
        mock_boot.side_effect = EventbritePlaceNotFoundError("invalid-slug")

        response = test_client.get(
            f"{settings.API_V1_STR}/eventbrite/places/invalid-slug"
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


def test_api_rate_limited_returns_429():
    test_client = TestClient(app)

    with patch(
        "app.integrations.eventbrite.service.EventbriteService.get_events",
        new_callable=AsyncMock,
    ) as mock_events:
        mock_events.side_effect = EventbriteRateLimitError(retry_after=30.0)

        response = test_client.get(f"{settings.API_V1_STR}/eventbrite/events")
        assert response.status_code == 429
        assert response.headers.get("Retry-After") == "30"
