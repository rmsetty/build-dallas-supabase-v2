"""Synthetic public-response fixtures: no accounts, tracking, or private data."""

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest
from app.integrations.meetup.client import MeetupClient, date_variables
from app.integrations.meetup.errors import (
    MeetupError,
    MeetupPersistedQueryError,
    MeetupSchemaError,
)
from app.integrations.meetup.normalize import normalize_event
from app.integrations.meetup.schemas import ResolvedLocation
from app.integrations.meetup.service import MeetupService, choose_location

LOCATION = {
    "city": "Dallas",
    "state": "TX",
    "country": "us",
    "lat": 32.79,
    "lon": -96.8,
    "timeZone": "US/Central",
}
EVENT = {
    "id": "abc123",
    "title": "Founder night",
    "dateTime": "2026-09-23T19:00:00-04:00",
    "description": "**Hello** <script>untrusted</script>",
    "eventType": "PHYSICAL",
    "eventUrl": "https://www.meetup.com/example/events/abc123/",
    "venue": {"name": "Venue", "city": "Austin", "state": "TX", "address": "Main St"},
    "group": {
        "id": 12,
        "name": "Founders",
        "urlname": "founders",
        "timezone": "US/Central",
        "keyGroupPhoto": {"highResUrl": "https://secure.meetupstatic.com/group.jpg"},
    },
    "rsvps": {"totalCount": 7},
    "maxTickets": 0,
    "rsvpState": "JOIN_OPEN",
    "feeSettings": {"amount": 20, "currency": "USD", "accepts": "PAYPAL"},
    "series": {
        "description": "Monthly",
        "monthlyRecurrence": {"monthlyDayOfWeek": "TUESDAY", "monthlyWeekOfMonth": 1},
        "events": {
            "edges": [
                {
                    "node": {
                        "id": "vlvvztyjcpbfb",
                        "dateTime": "2026-10-06T19:00:00-05:00",
                    }
                }
            ]
        },
    },
    "newUpstreamField": True,
    "isSaved": True,
}


def payload(events=None, more=False, cursor=None):
    return {
        "data": {
            "results": {
                "edges": [
                    {"node": e} for e in (events if events is not None else [EVENT])
                ],
                "pageInfo": {"hasNextPage": more, "endCursor": cursor},
                "totalCount": 1,
            }
        }
    }


def test_rich_normalization():
    event = normalize_event(EVENT)
    assert event.id == "abc123"
    assert event.location.city == "Austin"  # Search city is not venue city.
    assert event.location.latitude is None
    assert event.start_at.endswith("-04:00")
    assert event.image_url.endswith("group.jpg")
    assert event.organizer.id == "12"
    assert event.rsvp.count == 7 and event.rsvp.capacity is None
    assert event.pricing.amount == 20 and event.pricing.payment_method == "PAYPAL"
    assert event.tickets.is_free is False
    assert event.series.occurrences[0].id == "vlvvztyjcpbfb"
    assert event.series.monthly_recurrence["monthlyWeekOfMonth"] == 1
    assert "isSaved" not in event.model_dump_json()


@pytest.mark.parametrize(
    "kind,expected", [("ONLINE", "online"), ("NEW_KIND", "unknown"), (None, "unknown")]
)
def test_missing_optional(kind, expected):
    e = normalize_event(
        {"id": 123, "title": "Event", "dateTime": EVENT["dateTime"], "eventType": kind}
    )
    assert e.event_type == expected and e.image_url is None
    assert e.pricing.has_known_fee is False and e.tickets.is_free is None
    assert e.organizer is None and e.location.city is None


def test_online_and_photo_priority():
    raw = {
        **EVENT,
        "eventType": "ONLINE",
        "venue": {"name": "Online event", "city": "", "address": ""},
        "featuredEventPhoto": {"highResUrl": "https://example.com/first"},
        "displayPhoto": {"highResUrl": "https://example.com/second"},
    }
    assert normalize_event(raw).image_url.endswith("first")
    raw["featuredEventPhoto"] = None
    assert normalize_event(raw).image_url.endswith("second")
    assert normalize_event(raw).location.address is None
    raw["eventUrl"] = "javascript:alert(1)"
    assert normalize_event(raw).url is None


def test_dates_and_selection():
    d = date_variables(datetime(2026, 9, 18, 1, tzinfo=UTC), "US/Central")
    assert d == {
        "seriesStartDate": "2026-09-17",
        "startDateRange": "2026-09-17T20:00:00-05:00[US/Central]",
    }
    with pytest.raises(ValueError):
        date_variables(datetime(2026, 1, 1), "UTC")
    places = [
        ResolvedLocation(city=city, state=state, country="us", latitude=0, longitude=0)
        for city, state in [("Lake Dallas", "TX"), ("Dallas", "GA"), ("Dallas", "TX")]
    ]
    assert choose_location(places, {"city": "DALLAS", "state": "tx"}) is places[2]
    with pytest.raises(MeetupError):
        choose_location([])


def test_requests_cache_coalescing_pagination():
    async def run():
        requests = []

        async def handle(request):
            body = json.loads(request.content)
            requests.append(body)
            assert (
                "cookie" not in request.headers
                and "authorization" not in request.headers
            )
            await asyncio.sleep(0.01)
            if body["operationName"] == "getLocationSearch":
                return httpx.Response(
                    200,
                    json={"data": {"result": [LOCATION]}},
                    headers={"Set-Cookie": "user=ignore"},
                )
            return httpx.Response(
                200,
                json=payload(
                    more=not body["variables"].get("after"), cursor="opaque:cursor"
                ),
            )

        service = MeetupService(MeetupClient(httpx.MockTransport(handle)))
        try:
            pages = await asyncio.gather(
                *(service.get_events('Founder "hi"') for _ in range(5))
            )
            assert len(requests) == 2
            assert pages[0].items[0].id == "abc123"
            await service.get_events('Founder "hi"')
            assert len(requests) == 2
            page = await service.get_events('Founder "hi"', cursor="opaque:cursor")
            assert requests[-1]["variables"]["after"] == "opaque:cursor"
            assert requests[-1]["variables"]["query"] == 'Founder "hi"'
            assert not page.page_info.has_next_page
            assert (await service.get_event_detail("abc123")).title == EVENT["title"]
        finally:
            await service.aclose()

    asyncio.run(run())


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504, "timeout"])
def test_transient_retry(status, monkeypatch):
    async def noop(_):
        pass

    monkeypatch.setattr("app.integrations.meetup.client.asyncio.sleep", noop)

    async def run():
        calls = 0

        def handle(request):
            nonlocal calls
            calls += 1
            if calls == 1:
                if status == "timeout":
                    raise httpx.ReadTimeout("timeout")
                return httpx.Response(status, headers={"Retry-After": "0"})
            return httpx.Response(200, json={"data": {"result": []}})

        client = MeetupClient(httpx.MockTransport(handle))
        try:
            assert await client.search_locations("Dallas") == {"result": []}
            assert calls == 2
        finally:
            await client.aclose()

    asyncio.run(run())


def test_persisted_query_no_retry():
    async def run():
        calls = 0

        def handle(request):
            nonlocal calls
            calls += 1
            return httpx.Response(
                200, json={"errors": [{"message": "PersistedQueryNotFound"}]}
            )

        client = MeetupClient(httpx.MockTransport(handle))
        try:
            with pytest.raises(MeetupPersistedQueryError) as info:
                await client.search_locations("Dallas")
            assert info.value.operation == "getLocationSearch"
            assert info.value.status == 200 and calls == 1
        finally:
            await client.aclose()

    asyncio.run(run())


@pytest.mark.parametrize(
    "response", [{"data": {}}, {"data": {"result": None}}, {"notData": True}]
)
def test_schema_drift(response):
    async def run():
        service = MeetupService(
            MeetupClient(
                httpx.MockTransport(lambda r: httpx.Response(200, json=response))
            )
        )
        try:
            with pytest.raises(MeetupSchemaError):
                await service.resolve_location("Dallas")
        finally:
            await service.aclose()

    asyncio.run(run())


def test_routes_validation_and_error_mapping(provider_client):
    client = provider_client
    from app.api.routes.meetup import get_meetup_service

    from tests.provider_app import app

    class FakeService:
        async def get_events(self, query, location, cursor, first, start):
            assert query == "Founder" and location == "Dallas, TX"
            from app.integrations.meetup.schemas import SearchPage

            return SearchPage(
                items=[normalize_event(EVENT)], page_info={"hasNextPage": False}
            )

        async def get_event_detail(self, event_id):
            raise MeetupError("detail", "Refresh discovery", 404)

    app.dependency_overrides[get_meetup_service] = FakeService
    try:
        response = client.get("/v1/meetup/events?query=Founder")
        assert response.status_code == 200
        assert response.json()["items"][0]["source"] == "meetup"
        assert response.json()["pageInfo"]["hasNextPage"] is False
        assert client.get("/v1/meetup/events?first=0").status_code == 422
        assert (
            client.get("/v1/meetup/events?start_at=2026-09-17T12:00:00").status_code
            == 422
        )
        assert client.get("/v1/meetup/events/abc123").status_code == 404
    finally:
        app.dependency_overrides.pop(get_meetup_service, None)


def test_discover_partial_failure_and_series_dedupe():
    from app.integrations.meetup.discover import discover_startups
    from app.integrations.meetup.schemas import SearchPage

    class FakeService:
        async def cached(self, key, ttl, fetch):
            return await fetch()

        async def get_events(self, query, location, cursor, start_at):
            if query == "failed":
                raise MeetupError("search", "Unavailable")
            event = normalize_event({**EVENT, "dateTime": "2099-01-01T19:00:00-06:00"})
            return SearchPage(
                items=[event], page_info={"hasNextPage": True, "endCursor": "repeated"}
            )

    response = asyncio.run(
        discover_startups(FakeService(), "Dallas, TX", ["Founder", "Failed", "Founder"])
    )
    assert len(response.items) == 1
    assert response.items[0].series is not None
    assert response.failed_queries == ["failed"] and response.incomplete
