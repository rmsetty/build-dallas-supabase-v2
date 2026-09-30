"""Normalization functions transforming raw Luma structures into stable schemas."""

from datetime import datetime, timezone
from typing import Any

from app.integrations.luma.schemas import (
    LumaDiscoverPlace,
    NormalizedDiscoverPlaceRef,
    NormalizedHost,
    NormalizedLocation,
    NormalizedLumaEvent,
    NormalizedOrganizer,
    NormalizedTickets,
)


def _price_amount(value: Any) -> float | None:
    """Normalize Luma money objects from cents to major currency units."""
    if isinstance(value, dict):
        cents = value.get("cents")
        return cents / 100 if isinstance(cents, (int, float)) else None
    return float(value) if isinstance(value, (int, float)) else None


def _description_text(node: Any) -> str:
    """Read rich text without rendering untrusted HTML."""
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "hardBreak":
        return "\n"
    if isinstance(node.get("text"), str):
        return node["text"]
    content = "".join(_description_text(child) for child in node.get("content", []))
    return content + (
        "\n\n" if node.get("type") in ("paragraph", "heading", "listItem") else ""
    )


def normalize_luma_place(data: dict[str, Any]) -> LumaDiscoverPlace:
    """Normalize raw place data from Luma Next.js initial data."""
    coord = data.get("coordinate") or {}
    return LumaDiscoverPlace(
        id=data.get("api_id", ""),
        slug=data.get("slug", ""),
        name=data.get("name", ""),
        timezone=data.get("timezone"),
        latitude=coord.get("latitude") if isinstance(coord, dict) else None,
        longitude=coord.get("longitude") if isinstance(coord, dict) else None,
    )


def normalize_luma_event(
    entry: dict[str, Any],
    fallback_place: LumaDiscoverPlace | None = None,
) -> NormalizedLumaEvent:
    """Normalize a raw Luma event entry into NormalizedLumaEvent.

    Implements strict location privacy boundaries (Section 7).
    """
    raw_event = entry.get("event") if isinstance(entry.get("event"), dict) else {}
    event_id = str(raw_event.get("api_id") or entry.get("api_id") or "")
    slug = raw_event.get("url")

    # Determine canonical public URL
    if slug:
        url = f"https://luma.com/{slug}"
    elif event_id:
        url = f"https://luma.com/{event_id}"
    else:
        url = None

    # Privacy boundary for event location
    geo_visibility = raw_event.get("geo_address_visibility")
    raw_geo = raw_event.get("geo_address_info")
    geo_info = raw_geo if isinstance(raw_geo, dict) else {}
    mode = geo_info.get("mode")

    is_restricted = geo_visibility == "guests-only" or mode == "obfuscated"

    if is_restricted:
        location = NormalizedLocation(
            visibility="restricted",
            venue_name=None,
            address=None,
            city=geo_info.get("city") or geo_info.get("city_state"),
            region=geo_info.get("region") or geo_info.get("region_short"),
            country=geo_info.get("country"),
            country_code=geo_info.get("country_code"),
            latitude=None,
            longitude=None,
        )
    elif geo_visibility == "public" or mode == "shown":
        raw_coord = raw_event.get("coordinate") or geo_info.get("place_coordinate")
        coord = raw_coord if isinstance(raw_coord, dict) else {}
        full_address = geo_info.get("full_address")
        short_address = geo_info.get("address") or geo_info.get("short_address")

        venue_name = None
        address = full_address or short_address
        if short_address and full_address and short_address != full_address:
            venue_name = short_address

        lat = coord.get("latitude")
        lng = coord.get("longitude")

        location = NormalizedLocation(
            visibility="public",
            venue_name=venue_name,
            address=address,
            city=geo_info.get("city"),
            region=geo_info.get("region") or geo_info.get("region_short"),
            country=geo_info.get("country"),
            country_code=geo_info.get("country_code"),
            latitude=float(lat) if lat is not None else None,
            longitude=float(lng) if lng is not None else None,
        )
    else:
        is_online = raw_event.get("location_type") == "online"
        location = NormalizedLocation(
            visibility="public" if is_online else "unknown",
            venue_name=None,
            address=None,
            city=geo_info.get("city"),
            region=geo_info.get("region"),
            country=geo_info.get("country"),
            country_code=geo_info.get("country_code"),
            latitude=None,
            longitude=None,
        )

    # Calendar / Organizer
    raw_cal = entry.get("calendar")
    raw_calendar = raw_cal if isinstance(raw_cal, dict) else None
    organizer = (
        NormalizedOrganizer(
            id=raw_calendar.get("api_id"),
            name=raw_calendar.get("name"),
            slug=raw_calendar.get("slug"),
            avatar_url=raw_calendar.get("avatar_url"),
        )
        if raw_calendar
        else None
    )

    # Hosts
    hosts: list[NormalizedHost] = []
    for host in entry.get("hosts") or []:
        if isinstance(host, dict):
            hosts.append(
                NormalizedHost(
                    id=str(host.get("api_id") or ""),
                    name=host.get("name"),
                    username=host.get("username"),
                    avatar_url=host.get("avatar_url"),
                    bio=host.get("bio_short") or host.get("bio"),
                    website=host.get("website"),
                    linkedin=host.get("linkedin_handle"),
                    instagram=host.get("instagram_handle"),
                    twitter=host.get("twitter_handle"),
                )
            )

    # Ticket info
    raw_t = entry.get("ticket_info")
    raw_tickets = raw_t if isinstance(raw_t, dict) else {}
    tickets = NormalizedTickets(
        is_free=raw_tickets.get("is_free"),
        price=_price_amount(raw_tickets.get("price")),
        max_price=_price_amount(raw_tickets.get("max_price")),
        currency=(raw_tickets.get("price") or {}).get("currency")
        if isinstance(raw_tickets.get("price"), dict)
        else raw_tickets.get("currency"),
        is_sold_out=raw_tickets.get("is_sold_out"),
        spots_remaining=raw_tickets.get("spots_remaining"),
        is_near_capacity=raw_tickets.get("is_near_capacity"),
        require_approval=raw_tickets.get("require_approval"),
    )

    # Discover place reference
    raw_city = entry.get("featured_city")
    if isinstance(raw_city, dict):
        discover_place = NormalizedDiscoverPlaceRef(
            id=raw_city.get("api_id"),
            name=raw_city.get("name"),
            slug=raw_city.get("slug"),
        )
    elif fallback_place:
        discover_place = NormalizedDiscoverPlaceRef(
            id=fallback_place.id,
            name=fallback_place.name,
            slug=fallback_place.slug,
        )
    else:
        discover_place = None

    # Waitlist
    waitlist_enabled = raw_event.get("waitlist_enabled")
    if waitlist_enabled is None:
        waitlist_enabled = entry.get("waitlist_active")
    waitlist_status = raw_event.get("waitlist_status")

    return NormalizedLumaEvent(
        source="luma",
        id=event_id,
        slug=slug,
        url=url,
        title=raw_event.get("name") or "Untitled Event",
        description=_description_text(entry.get("description_mirror")).strip() or None,
        start_at=raw_event.get("start_at") or entry.get("start_at") or "",
        end_at=raw_event.get("end_at") or entry.get("end_at"),
        timezone=raw_event.get("timezone") or entry.get("timezone"),
        image_url=raw_event.get("cover_url"),
        social_image_url=raw_event.get("social_image_url"),
        location_type=raw_event.get("location_type"),
        location=location,
        organizer=organizer,
        hosts=hosts,
        guest_count=entry.get("guest_count"),
        ticket_count=entry.get("ticket_count"),
        tickets=tickets,
        registration_availability=entry.get("registration_availability"),
        waitlist_enabled=waitlist_enabled,
        waitlist_status=waitlist_status,
        discover_place=discover_place,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )
