from unittest.mock import AsyncMock

import pytest
from app.integrations.luma.discover import discover_startups, relevant
from app.integrations.luma.errors import LumaUpstreamError
from app.integrations.luma.normalize import normalize_luma_event
from app.integrations.luma.schemas import LumaDiscoverPlace, LumaEventsPage
from app.integrations.luma.service import LumaService


def event(id, title, description=None, start="2099-01-01T12:00:00Z"):
    return normalize_luma_event(
        {
            "event": {"api_id": id, "name": title, "start_at": start},
        }
    ).model_copy(update={"description": description})


def page(items, more=False, cursor=None):
    return LumaEventsPage(items=items, events=items, has_more=more, next_cursor=cursor)


@pytest.mark.anyio
async def test_discovery_deduplicates_filters_hydrates_and_caches():
    service = LumaService(client=AsyncMock())
    service.resolve_place = AsyncMock(
        return_value=LumaDiscoverPlace(
            id="discplace-dallas", slug="dallas", name="Dallas"
        )
    )
    founder = event("evt-founder", "Founder dinner")
    ambiguous = event("evt-innovation", "Innovation Unwind")
    irrelevant = event("evt-baseball", "Angels vs Rangers")
    past = event("evt-old", "Startup event", start="2000-01-01T00:00:00Z")
    service.search_events = AsyncMock(
        side_effect=[
            page([founder, ambiguous, irrelevant, past]),
            page([founder]),
        ]
    )
    service.get_event_detail = AsyncMock(
        side_effect=[
            ambiguous.model_copy(
                update={"description": "Meet startup founders and investors."}
            ),
            irrelevant,
        ]
    )
    result = await discover_startups(service, "dallas", ["founder", "VC", "founder"])
    assert [e.id for e in result.items] == ["evt-founder", "evt-innovation"]
    assert not result.incomplete
    assert service.search_events.call_count == 2
    assert await discover_startups(service, "dallas", ["founder", "vc"]) == result
    assert service.search_events.call_count == 2


@pytest.mark.anyio
async def test_discovery_reports_partial_errors_and_truncation():
    service = LumaService(client=AsyncMock())
    service.resolve_place = AsyncMock(
        return_value=LumaDiscoverPlace(id="place", slug="dallas", name="Dallas")
    )

    async def search(place, keyword, limit, cursor, resolved):
        if keyword == "vc":
            raise LumaUpstreamError(503)
        return page([event("evt-founder", "Founder dinner")], more=True, cursor="same")

    service.search_events = search
    result = await discover_startups(service, "dallas", ["founder", "vc"])
    assert result.incomplete
    assert result.failed_queries == ["vc"]
    assert len(result.items) == 1


@pytest.mark.anyio
async def test_discovery_all_fail_is_an_error_not_empty_feed():
    service = LumaService(client=AsyncMock())
    service.resolve_place = AsyncMock(
        return_value=LumaDiscoverPlace(id="place", slug="dallas", name="Dallas")
    )
    service.search_events = AsyncMock(side_effect=LumaUpstreamError(503))
    with pytest.raises(LumaUpstreamError):
        await discover_startups(service, "dallas", ["founder"])


@pytest.mark.parametrize(
    "title, expected",
    [
        ("Los Angeles social", False),
        ("Angels vs Rangers", False),
        ("Startup founders", True),
        ("VC office hours", True),
        ("Angel investing 101", True),
        ("Demo day", True),
    ],
)
def test_relevance_word_boundaries(title, expected):
    assert relevant(event("evt-test", title)) is expected


def test_speaker_founder_bio_alone_is_not_startup_relevance():
    talk = event(
        "evt-talk", "A health talk", "Join Jane, founder of a health alliance."
    )
    assert not relevant(talk)
    assert relevant(
        talk.model_copy(update={"description": "A networking event for founders."})
    )


def test_discovery_endpoint_bounds_and_default_city():
    from app.integrations.luma import get_luma_service
    from fastapi.testclient import TestClient

    from tests.provider_app import app

    service = LumaService(client=AsyncMock())
    service.resolve_place = AsyncMock(
        return_value=LumaDiscoverPlace(id="place", slug="dallas", name="Dallas")
    )
    service.search_events = AsyncMock(
        return_value=page([event("evt-startup", "Startup night")])
    )
    app.dependency_overrides[get_luma_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.get(
                "/v1/luma/discover",
                params=[("queries", "startup"), ("queries", "founder")],
            )
            assert response.status_code == 200
            assert len(response.json()["items"]) == 1
            assert response.json()["failedQueries"] == []
            service.resolve_place.assert_called_once_with("dallas")
            assert (
                client.get(
                    "/v1/luma/discover", params=[("queries", str(i)) for i in range(9)]
                ).status_code
                == 422
            )
            assert (
                client.get(
                    "/v1/luma/discover", params={"queries": "x" * 65}
                ).status_code
                == 422
            )
    finally:
        app.dependency_overrides.pop(get_luma_service, None)


def test_general_audience_list_is_not_startup_topic():
    assert not relevant(
        event(
            "evt-fitness",
            "Pilates in Pink",
            "Whether you are a professional, entrepreneur, founder, "
            "student or creative, join us.",
        )
    )
