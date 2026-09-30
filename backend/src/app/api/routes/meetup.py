"""Public, read-only Meetup discovery. No account or user context required."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import AwareDatetime, StringConstraints

from app.integrations.meetup.discover import discover_startups
from app.integrations.meetup.schemas import (
    MeetupEvent,
    ResolvedLocation,
    SearchPage,
    StartupEvents,
)
from app.integrations.meetup.service import MeetupService
from app.services.event_relevance import DEFAULT_QUERIES

router = APIRouter()


def get_meetup_service(request: Request) -> MeetupService:
    return request.app.state.meetup_service


Service = Annotated[MeetupService, Depends(get_meetup_service)]
Keyword = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]


@router.get("/locations", response_model=ResolvedLocation)
async def resolve_location(
    service: Service,
    query: Annotated[str, Query(min_length=1, max_length=120)],
    city: str | None = None,
    state: str | None = None,
    country: str | None = None,
):
    return await service.resolve_location(
        query, {"city": city, "state": state, "country": country}
    )


@router.get("/events", response_model=SearchPage)
async def events(
    service: Service,
    query: Annotated[str, Query(max_length=120)] = "",
    location: Annotated[str, Query(min_length=1, max_length=120)] = "Dallas, TX",
    cursor: Annotated[str | None, Query(max_length=2048)] = None,
    first: Annotated[int, Query(ge=1, le=50)] = 12,
    start_at: AwareDatetime | None = None,
):
    return await service.get_events(query, location, cursor, first, start_at)


@router.get("/events/{event_id}", response_model=MeetupEvent)
async def detail(
    service: Service, event_id: Annotated[str, Path(pattern=r"^[a-zA-Z0-9_-]{1,100}$")]
):
    return await service.get_event_detail(event_id)


@router.get("/discover", response_model=StartupEvents)
async def discover(
    service: Service,
    location: Annotated[str, Query(min_length=1, max_length=120)] = "Dallas, TX",
    queries: Annotated[list[Keyword] | None, Query(max_length=8)] = None,
):
    return await discover_startups(service, location, queries or list(DEFAULT_QUERIES))
