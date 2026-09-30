"""Pydantic schemas for Eventbrite models and normalized events."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that serializes attributes to camelCase."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class EventbriteBootstrap(CamelModel):
    """Bootstrap metadata extracted from an Eventbrite discovery page."""

    place_id: str
    place_name: str | None = None
    place_type: str | None = None
    location_slug: str
    csrf_token: str
    csrf_cookie: str | None = None
    fetched_at: str


class NormalizedEventbriteVenue(CamelModel):
    """Normalized event venue details."""

    id: str | None = None
    name: str | None = None
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    region: str | None = None
    postal_code: str | None = None
    country_code: str | None = None
    display_address: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class NormalizedEventbriteOrganizer(CamelModel):
    """Normalized primary organizer metadata."""

    id: str | None = None
    name: str | None = None
    url: str | None = None
    website_url: str | None = None
    summary: str | None = None


class NormalizedEventbriteTags(CamelModel):
    """Normalized categorization tags segregated by namespace."""

    categories: list[str] = []
    subcategories: list[str] = []
    formats: list[str] = []
    organizer_tags: list[str] = []


class NormalizedEventbriteTickets(CamelModel):
    """Normalized ticket pricing and availability."""

    is_free: bool | None = None
    has_available_tickets: bool | None = None
    is_sold_out: bool | None = None
    has_bogo_tickets: bool | None = None
    minimum_price_minor: int | None = None
    maximum_price_minor: int | None = None
    currency: str | None = None


class NormalizedEventbriteEvent(CamelModel):
    """Internal canonical schema for an Eventbrite event."""

    source: Literal["eventbrite"] = "eventbrite"
    id: str
    url: str | None = None
    title: str
    summary: str | None = None
    start_at: str
    end_at: str | None = None
    timezone: str | None = None
    image_url: str | None = None
    image_small_url: str | None = None
    image_medium_url: str | None = None
    image_large_url: str | None = None
    is_online: bool | None = None
    venue: NormalizedEventbriteVenue | None = None
    organizer: NormalizedEventbriteOrganizer | None = None
    tags: NormalizedEventbriteTags
    tickets: NormalizedEventbriteTickets
    sales_status: str | None = None
    series_id: str | None = None
    published_at: str | None = None
    fetched_at: str


class EventbritePagination(CamelModel):
    """Eventbrite pagination metadata."""

    page: int
    page_size: int
    page_count: int | None = None
    object_count: int | None = None
    continuation: str | None = None


class EventbriteSearchPage(CamelModel):
    """Paginated collection of normalized Eventbrite events."""

    events: list[NormalizedEventbriteEvent]
    items: list[NormalizedEventbriteEvent]
    pagination: EventbritePagination
    place: EventbriteBootstrap | None = None
