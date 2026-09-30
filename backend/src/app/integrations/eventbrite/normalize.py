"""Normalization logic transforming raw Eventbrite events into internal schemas."""

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.integrations.eventbrite.schemas import (
    NormalizedEventbriteEvent,
    NormalizedEventbriteOrganizer,
    NormalizedEventbriteTags,
    NormalizedEventbriteTickets,
    NormalizedEventbriteVenue,
)


def _to_iso(
    date_str: str | None, time_str: str | None, tz_name: str | None
) -> str | None:
    """Format local date and time into a timezone-aware ISO timestamp string."""
    if not date_str or not time_str:
        return None
    try:
        clean_time = time_str if len(time_str.split(":")) >= 3 else f"{time_str}:00"
        naive_dt = datetime.fromisoformat(f"{date_str}T{clean_time}")
        if tz_name:
            try:
                aware_dt = naive_dt.replace(tzinfo=ZoneInfo(tz_name))
                return aware_dt.isoformat()
            except (ZoneInfoNotFoundError, ValueError):
                pass
        return naive_dt.isoformat()
    except Exception:
        return f"{date_str}T{time_str}"


def normalize_eventbrite_event(raw: dict[str, Any]) -> NormalizedEventbriteEvent:
    """Normalize a raw Eventbrite event dictionary into NormalizedEventbriteEvent."""
    event_id = str(raw.get("eventbrite_event_id") or raw.get("id") or "")
    url = raw.get("url")
    title = raw.get("name") or "Untitled Event"
    summary = raw.get("summary")

    tz_str = raw.get("timezone")
    start_at = _to_iso(raw.get("start_date"), raw.get("start_time"), tz_str) or ""
    end_at = _to_iso(raw.get("end_date"), raw.get("end_time"), tz_str)

    # Image handling
    raw_img = raw.get("image")
    image_dict = raw_img if isinstance(raw_img, dict) else {}
    raw_sizes = image_dict.get("image_sizes")
    sizes = raw_sizes if isinstance(raw_sizes, dict) else {}
    raw_orig = image_dict.get("original")
    orig = raw_orig if isinstance(raw_orig, dict) else {}

    image_small = sizes.get("small")
    image_medium = sizes.get("medium")
    image_large = sizes.get("large")
    image_url = (
        image_large
        or image_medium
        or image_dict.get("url")
        or orig.get("url")
        or image_small
    )

    is_online = raw.get("is_online_event")

    # Venue normalization
    raw_ven = raw.get("primary_venue")
    raw_venue = raw_ven if isinstance(raw_ven, dict) else None
    if raw_venue:
        raw_addr = raw_venue.get("address")
        addr = raw_addr if isinstance(raw_addr, dict) else {}
        lat_raw = addr.get("latitude")
        lng_raw = addr.get("longitude")

        lat = None
        lng = None
        try:
            if lat_raw is not None:
                lat = float(lat_raw)
        except (ValueError, TypeError):
            pass
        try:
            if lng_raw is not None:
                lng = float(lng_raw)
        except (ValueError, TypeError):
            pass

        venue = NormalizedEventbriteVenue(
            id=raw_venue.get("id"),
            name=raw_venue.get("name"),
            address1=addr.get("address_1"),
            address2=addr.get("address_2"),
            city=addr.get("city"),
            region=addr.get("region"),
            postal_code=addr.get("postal_code"),
            country_code=addr.get("country"),
            display_address=addr.get("localized_address_display"),
            latitude=lat,
            longitude=lng,
        )
    else:
        venue = None

    # Organizer normalization
    raw_org = raw.get("primary_organizer")
    organizer_dict = raw_org if isinstance(raw_org, dict) else None
    if organizer_dict:
        organizer = NormalizedEventbriteOrganizer(
            id=organizer_dict.get("id"),
            name=organizer_dict.get("name"),
            url=organizer_dict.get("url"),
            website_url=organizer_dict.get("website_url"),
            summary=organizer_dict.get("summary"),
        )
    else:
        organizer = None

    # Tags normalization
    categories: list[str] = []
    subcategories: list[str] = []
    formats: list[str] = []
    organizer_tags: list[str] = []
    for tag in raw.get("tags") or []:
        if isinstance(tag, dict):
            prefix = tag.get("prefix")
            name = tag.get("display_name")
            if not name:
                continue
            if prefix == "EventbriteCategory":
                categories.append(name)
            elif prefix == "EventbriteSubCategory":
                subcategories.append(name)
            elif prefix == "EventbriteFormat":
                formats.append(name)
            elif prefix == "OrganizerTag":
                organizer_tags.append(name)

    tags = NormalizedEventbriteTags(
        categories=categories,
        subcategories=subcategories,
        formats=formats,
        organizer_tags=organizer_tags,
    )

    # Ticket info
    raw_t = raw.get("ticket_availability")
    raw_tickets = raw_t if isinstance(raw_t, dict) else {}
    raw_min = raw_tickets.get("minimum_ticket_price")
    min_price_obj = raw_min if isinstance(raw_min, dict) else {}
    raw_max = raw_tickets.get("maximum_ticket_price")
    max_price_obj = raw_max if isinstance(raw_max, dict) else {}
    raw_sales = raw.get("event_sales_status")
    sales_obj = raw_sales if isinstance(raw_sales, dict) else {}

    currency = (
        min_price_obj.get("currency")
        or max_price_obj.get("currency")
        or sales_obj.get("currency")
    )
    tickets = NormalizedEventbriteTickets(
        is_free=raw_tickets.get("is_free"),
        has_available_tickets=raw_tickets.get("has_available_tickets"),
        is_sold_out=raw_tickets.get("is_sold_out"),
        has_bogo_tickets=raw_tickets.get("has_bogo_tickets"),
        minimum_price_minor=min_price_obj.get("value"),
        maximum_price_minor=max_price_obj.get("value"),
        currency=currency,
    )

    sales_status = sales_obj.get("sales_status")
    series_id = raw.get("series_id")
    published_at = raw.get("published")

    return NormalizedEventbriteEvent(
        source="eventbrite",
        id=event_id,
        url=url,
        title=title,
        summary=summary,
        start_at=start_at,
        end_at=end_at,
        timezone=tz_str,
        image_url=image_url,
        image_small_url=image_small,
        image_medium_url=image_medium,
        image_large_url=image_large,
        is_online=is_online,
        venue=venue,
        organizer=organizer,
        tags=tags,
        tickets=tickets,
        sales_status=sales_status,
        series_id=series_id,
        published_at=published_at,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )
