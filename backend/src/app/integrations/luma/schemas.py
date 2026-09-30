"""Pydantic schemas for Luma integration models and normalized event representations."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that outputs camelCase keys to match internal frontend schema."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class LumaDiscoverPlace(CamelModel):
    """Normalized representation of a Luma discover place."""

    id: str
    slug: str
    name: str
    timezone: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class NormalizedLocation(CamelModel):
    """Normalized event location respecting privacy boundaries."""

    visibility: Literal["public", "restricted", "unknown"] = "unknown"
    venue_name: str | None = None
    address: str | None = None
    city: str | None = None
    region: str | None = None
    country: str | None = None
    country_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class NormalizedOrganizer(CamelModel):
    """Normalized calendar / organizer metadata."""

    id: str | None = None
    name: str | None = None
    slug: str | None = None
    avatar_url: str | None = None


class NormalizedHost(CamelModel):
    """Normalized event host metadata."""

    id: str
    name: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    website: str | None = None
    linkedin: str | None = None
    instagram: str | None = None
    twitter: str | None = None


class NormalizedTickets(CamelModel):
    """Normalized ticket and pricing status."""

    is_free: bool | None = None
    price: float | None = None
    max_price: float | None = None
    currency: str | None = None
    is_sold_out: bool | None = None
    spots_remaining: int | None = None
    is_near_capacity: bool | None = None
    require_approval: bool | None = None


class NormalizedDiscoverPlaceRef(CamelModel):
    """Reference to the discover place associated with an event."""

    id: str | None = None
    name: str | None = None
    slug: str | None = None


class NormalizedLumaEvent(CamelModel):
    """Stable internal representation of a Luma event."""

    source: Literal["luma"] = "luma"
    id: str
    slug: str | None = None
    url: str | None = None
    title: str
    description: str | None = None
    start_at: str
    end_at: str | None = None
    timezone: str | None = None
    image_url: str | None = None
    social_image_url: str | None = None
    location_type: str | None = None
    location: NormalizedLocation
    organizer: NormalizedOrganizer | None = None
    hosts: list[NormalizedHost] = []
    guest_count: int | None = None
    ticket_count: int | None = None
    tickets: NormalizedTickets
    registration_availability: str | None = None
    waitlist_enabled: bool | None = None
    waitlist_status: str | None = None
    discover_place: NormalizedDiscoverPlaceRef | None = None
    fetched_at: str


class LumaEventsPage(CamelModel):
    """Paginated list of normalized Luma events."""

    items: list[NormalizedLumaEvent]
    events: list[NormalizedLumaEvent]
    has_more: bool = False
    next_cursor: str | None = None
    place: LumaDiscoverPlace | None = None
    total: int | None = None
