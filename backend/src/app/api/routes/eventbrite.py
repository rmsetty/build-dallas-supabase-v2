"""Thin FastAPI routes for unofficial Eventbrite event discovery."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from pydantic import StringConstraints

from app.integrations.eventbrite import (
    EventbriteBootstrap,
    EventbriteSearchPage,
    EventbriteService,
    get_eventbrite_service,
)
from app.integrations.eventbrite.discover import (
    EventbriteStartupEvents,
    discover_startups,
)
from app.integrations.eventbrite.schemas import NormalizedEventbriteEvent
from app.services.event_relevance import DEFAULT_QUERIES

router = APIRouter()

Service = Annotated[EventbriteService, Depends(get_eventbrite_service)]


@router.get("/events", response_model=EventbriteSearchPage)
async def list_eventbrite_events(
    service: Service,
    query: Annotated[str | None, Query(description="Search keyword")] = None,
    q: Annotated[str | None, Query(description="Alias for query keyword")] = None,
    location: Annotated[
        str, Query(description="Location slug (defaults to tx--dallas)")
    ] = "tx--dallas",
    place_id: Annotated[
        str | None, Query(description="Optional direct Eventbrite numeric place ID")
    ] = None,
    page: Annotated[int, Query(ge=1, le=100, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=50, description="Page size limit")] = 20,
    limit: Annotated[
        int | None, Query(ge=1, le=50, description="Alias for page_size")
    ] = None,
) -> EventbriteSearchPage:
    """Search or browse organic public Eventbrite events.

    Automatically resolves location slug to internal place ID and extracts CSRF token.
    Promoted results are strictly ignored.
    """
    search_query = query if query is not None else q
    effective_limit = limit if limit is not None else page_size
    return await service.get_events(
        location=location,
        query=search_query,
        place_id=place_id,
        page=page,
        page_size=effective_limit,
    )


@router.get("/places/{location_slug}", response_model=EventbriteBootstrap)
async def get_eventbrite_place(
    location_slug: Annotated[
        str,
        Path(description="Eventbrite location slug (e.g. tx--dallas, tx--plano)"),
    ],
    service: Service,
) -> EventbriteBootstrap:
    """Resolve an Eventbrite location slug into its place ID and bootstrap metadata."""
    return await service.get_bootstrap(location_slug)


@router.get("/events/{event_id}", response_model=NormalizedEventbriteEvent)
async def get_eventbrite_event(
    event_id: Annotated[str, Path(pattern=r"^[0-9]{1,30}$")],
    service: Service,
) -> NormalizedEventbriteEvent:
    return await service.get_event_detail(event_id)


SearchKeyword = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]


@router.get("/discover", response_model=EventbriteStartupEvents)
async def startup_events(
    service: Service,
    location: Annotated[str, Query(min_length=1, max_length=80)] = "tx--dallas",
    queries: Annotated[list[SearchKeyword] | None, Query(max_length=8)] = None,
) -> EventbriteStartupEvents:
    return await discover_startups(service, location, queries or list(DEFAULT_QUERIES))
