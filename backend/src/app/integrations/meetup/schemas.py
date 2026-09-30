"""Stable application models; no GraphQL edges or user-state metadata."""

from typing import Literal

from pydantic import Field

from app.integrations.luma.schemas import (
    CamelModel,
    NormalizedLocation,
    NormalizedOrganizer,
    NormalizedTickets,
)


class ResolvedLocation(CamelModel):
    city: str
    state: str | None = None
    country: str
    zip: str | None = None
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timezone: str | None = None
    name: str | None = None
    borough: str | None = None
    neighborhood: str | None = None


class RSVP(CamelModel):
    status: str | None = None
    count: int | None = None
    capacity: int | None = None


class Pricing(CamelModel):
    amount: float | None = None
    currency: str | None = None
    payment_method: str | None = None
    has_known_fee: bool = False


class Occurrence(CamelModel):
    id: str
    start_at: str


class Series(CamelModel):
    description: str | None = None
    weekly_recurrence: dict | None = None
    monthly_recurrence: dict | None = None
    occurrences: list[Occurrence] = Field(default_factory=list)


class MeetupEvent(CamelModel):
    source: Literal["meetup"] = "meetup"
    id: str
    url: str | None = None
    title: str
    description: str | None = None
    start_at: str
    end_at: str | None = None
    timezone: str | None = None
    image_url: str | None = None
    social_image_url: str | None = None
    event_type: Literal["physical", "online", "unknown"]
    location_type: str
    location: NormalizedLocation
    organizer: NormalizedOrganizer | None = None
    hosts: list = Field(default_factory=list)
    guest_count: int | None = None
    tickets: NormalizedTickets
    registration_availability: str | None = None
    waitlist_status: str | None = None
    rsvp: RSVP
    pricing: Pricing
    series: Series | None = None
    fetched_at: str


class PageInfo(CamelModel):
    has_next_page: bool
    end_cursor: str | None = None


class SearchPage(CamelModel):
    items: list[MeetupEvent]
    page_info: PageInfo
    total_count: int | None = None


class StartupEvents(CamelModel):
    items: list[MeetupEvent]
    queries: list[str]
    failed_queries: list[str] = Field(default_factory=list)
    incomplete: bool = False
    fetched_at: str
