"""Defensive normalization of public search records."""

import math
from datetime import UTC, datetime
from urllib.parse import urlsplit

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .schemas import MeetupEvent, Occurrence, Series


class RawEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str | int
    title: str = Field(min_length=1)
    dateTime: AwareDatetime


def obj(value):
    return value if isinstance(value, dict) else {}


def text(value):
    return value.strip() or None if isinstance(value, str) else None


def url(value):
    value = text(value)
    if (
        value
        and urlsplit(value).scheme in ("http", "https")
        and urlsplit(value).hostname
    ):
        return value
    return None


def number(value):
    return (
        value
        if type(value) in (int, float) and math.isfinite(value) and value >= 0
        else None
    )


def count(value):
    return value if type(value) is int and value >= 0 else None


def photo(value):
    return url(obj(value).get("highResUrl"))


def normalize_event(raw):
    core = RawEvent.model_validate(raw)
    group, venue, fee = (obj(raw.get(k)) for k in ("group", "venue", "feeSettings"))
    kind = {"PHYSICAL": "physical", "ONLINE": "online"}.get(
        raw.get("eventType"), "unknown"
    )
    amount = number(fee.get("amount"))
    capacity = count(raw.get("maxTickets")) or None
    guests = count(obj(raw.get("rsvps")).get("totalCount"))
    series = None
    if isinstance(raw.get("series"), dict):
        s = raw["series"]
        occurrences = []
        edges = obj(s.get("events")).get("edges")
        for edge in edges if isinstance(edges, list) else []:
            child = obj(obj(edge).get("node"))
            try:
                valid = RawEvent.model_validate({**child, "title": core.title})
                occurrences.append(
                    Occurrence(id=str(valid.id), start_at=valid.dateTime.isoformat())
                )
            except ValueError:
                continue
        series = Series(
            description=text(s.get("description")),
            weekly_recurrence=obj(s.get("weeklyRecurrence")) or None,
            monthly_recurrence=obj(s.get("monthlyRecurrence")) or None,
            occurrences=occurrences,
        )
    return MeetupEvent(
        id=str(core.id),
        title=core.title,
        start_at=core.dateTime.isoformat(),
        url=url(raw.get("eventUrl")),
        description=text(raw.get("description")),
        timezone=text(group.get("timezone")),
        event_type=kind,
        location_type="offline" if kind == "physical" else kind,
        image_url=photo(raw.get("featuredEventPhoto"))
        or photo(raw.get("displayPhoto"))
        or photo(group.get("keyGroupPhoto")),
        location=dict(
            visibility="public" if venue else "unknown",
            venue_name=text(venue.get("name")),
            address=text(venue.get("address")),
            city=text(venue.get("city")),
            region=text(venue.get("state")),
            country_code=text(venue.get("country")),
        ),
        organizer=dict(
            id=str(group["id"]) if group.get("id") is not None else None,
            name=text(group.get("name")),
            slug=text(group.get("urlname")),
            avatar_url=photo(group.get("keyGroupPhoto")),
        )
        if group
        else None,
        guest_count=guests,
        tickets=dict(
            is_free=amount == 0 if amount is not None else None,
            price=amount,
            currency=text(fee.get("currency")),
        ),
        registration_availability="open"
        if raw.get("rsvpState") == "JOIN_OPEN"
        else None,
        rsvp=dict(status=text(raw.get("rsvpState")), count=guests, capacity=capacity),
        pricing=dict(
            amount=amount,
            currency=text(fee.get("currency")),
            payment_method=text(fee.get("accepts")),
            has_known_fee=isinstance(raw.get("feeSettings"), dict),
        ),
        series=series,
        fetched_at=datetime.now(UTC).isoformat(),
    )
