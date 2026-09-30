"""Thin FastAPI routes for unofficial Luma event discovery and place resolution."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from pydantic import StringConstraints

from app.integrations.luma import (
    LumaDiscoverPlace,
    LumaEventsPage,
    LumaService,
    NormalizedLumaEvent,
    get_luma_service,
)
from app.integrations.luma.discover import (
    DEFAULT_QUERIES,
    StartupEvents,
    discover_startups,
)

router = APIRouter()

Service = Annotated[LumaService, Depends(get_luma_service)]


@router.get("/events", response_model=LumaEventsPage)
async def list_luma_events(
    service: Service,
    query: Annotated[str | None, Query(description="Search keyword")] = None,
    q: Annotated[str | None, Query(description="Alias for query keyword")] = None,
    city: Annotated[
        str, Query(description="City slug (defaults to dallas)")
    ] = "dallas",
    place_id: Annotated[
        str | None, Query(description="Optional direct Luma discplace-* ID")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=50, description="Page limit")] = 25,
    cursor: Annotated[str | None, Query(description="Pagination cursor")] = None,
) -> LumaEventsPage:
    """Search or browse public Luma events.

    Automatically resolves city slug to place_id when place_id is not specified.
    """
    search_query = query if query is not None else q
    return await service.get_events(
        city=city,
        place_id=place_id,
        query=search_query,
        limit=limit,
        cursor=cursor,
    )


@router.get("/events/{event_id}", response_model=NormalizedLumaEvent)
async def get_luma_event(
    event_id: Annotated[
        str,
        Path(pattern=r"^evt-[A-Za-z0-9]+$", description="Luma event API ID"),
    ],
    service: Service,
) -> NormalizedLumaEvent:
    """Retrieve normalized detail for a specific Luma event by evt-* ID."""
    return await service.get_event_detail(event_id)


@router.get("/places/{slug}", response_model=LumaDiscoverPlace)
async def get_luma_place(
    slug: Annotated[str, Path(description="City slug (e.g. dallas, austin)")],
    service: Service,
) -> LumaDiscoverPlace:
    """Resolve a city slug into a Luma discover place record."""
    return await service.resolve_place(slug)


SearchKeyword = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]


@router.get("/discover", response_model=StartupEvents)
async def startup_events(
    service: Service,
    city: Annotated[str, Query(min_length=1, max_length=80)] = "dallas",
    queries: Annotated[list[SearchKeyword] | None, Query(max_length=8)] = None,
) -> StartupEvents:
    """Union startup keyword searches, deduplicate IDs, and verify relevance.

    Repeated queries parameters override default keywords. Results are bounded;
    incomplete indicates upstream errors or a search/detail cap was reached.
    """
    return await discover_startups(service, city, queries or list(DEFAULT_QUERIES))
