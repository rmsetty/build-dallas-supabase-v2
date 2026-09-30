"""Bounded cache and singleflight discovery; search records also serve details."""

import asyncio
import logging
import time
from collections import OrderedDict

from pydantic import ValidationError

from .client import MeetupClient
from .errors import MeetupError, MeetupSchemaError
from .normalize import normalize_event, obj, text
from .schemas import PageInfo, ResolvedLocation, SearchPage

logger = logging.getLogger(__name__)


def choose_location(results, expected=None):
    if not results:
        raise MeetupError("getLocationSearch", "No Meetup locations found", 404)
    expected = expected or {}
    return max(
        results,
        key=lambda place: tuple(
            bool(expected.get(k))
            and (getattr(place, k) or "").casefold() == expected[k].casefold()
            for k in ("city", "state", "country")
        ),
    )


class MeetupService:
    def __init__(self, client=None):
        self.client = client or MeetupClient()
        self.cache = OrderedDict()
        self.inflight = {}

    async def aclose(self):
        tasks = list(self.inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.client.aclose()

    def put(self, key, value, ttl):
        self.cache[key] = (time.monotonic() + ttl, value)
        self.cache.move_to_end(key)
        while len(self.cache) > 2048:
            self.cache.popitem(last=False)

    def get(self, key):
        entry = self.cache.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]
        self.cache.pop(key, None)
        return None

    async def cached(self, key, ttl, fetch):
        cached = self.get(key)
        logger.info("meetup.cache hit=%s", cached is not None)
        if cached is not None:
            return cached
        if key not in self.inflight:

            async def run():
                try:
                    value = await fetch()
                    self.put(key, value, ttl)
                    return value
                finally:
                    self.inflight.pop(key, None)

            task = asyncio.create_task(run())
            task.add_done_callback(
                lambda t: t.exception() if not t.cancelled() else None
            )
            self.inflight[key] = task
        return await asyncio.shield(self.inflight[key])

    async def resolve_location(self, query, expected=None):
        query = " ".join(query.split())

        async def fetch():
            data = await self.client.search_locations(query)
            if not isinstance(data.get("result"), list):
                raise MeetupSchemaError(
                    "getLocationSearch", "Meetup location schema changed"
                )
            results = []
            for raw in data["result"]:
                raw = obj(raw)
                try:
                    results.append(
                        ResolvedLocation(
                            city=raw.get("city"),
                            country=raw.get("country"),
                            latitude=raw.get("lat"),
                            longitude=raw.get("lon"),
                            timezone=text(raw.get("timeZone")),
                            **{
                                k: text(raw.get(k))
                                for k in (
                                    "state",
                                    "zip",
                                    "name",
                                    "borough",
                                    "neighborhood",
                                )
                            },
                        )
                    )
                except ValidationError as exc:
                    raise MeetupSchemaError(
                        "getLocationSearch", "Invalid Meetup location"
                    ) from exc
            return results

        results = await self.cached(("location", query.casefold()), 86400 * 3, fetch)
        return choose_location(results, expected)

    async def get_events(
        self, query="", location="Dallas, TX", cursor=None, first=12, start_at=None
    ):
        parts = [p.strip() for p in location.split(",")]
        expected = {"city": parts[0]}
        if len(parts) > 1:
            expected["state"] = parts[1]
        place = await self.resolve_location(location, expected)
        key = (
            "search",
            query.strip(),
            place.model_dump_json(),
            cursor,
            first,
            start_at.isoformat() if start_at else None,
        )

        async def fetch():
            data = await self.client.search_events(
                query.strip(), place, first, cursor, start_at
            )
            results = obj(data.get("results"))
            if not isinstance(results.get("edges"), list):
                raise MeetupSchemaError(
                    "eventSearchWithSeries", "Meetup search schema changed"
                )
            try:
                page_info = PageInfo.model_validate(
                    results.get("pageInfo"), strict=True
                )
                events = [
                    normalize_event(obj(edge).get("node")) for edge in results["edges"]
                ]
                page = SearchPage(
                    items=events,
                    page_info=page_info,
                    total_count=results.get("totalCount"),
                )
            except (ValueError, TypeError, AttributeError) as exc:
                logger.error("meetup.schema_error operation=eventSearchWithSeries")
                raise MeetupSchemaError(
                    "eventSearchWithSeries", "Invalid Meetup event response"
                ) from exc
            for event in events:
                self.put(("event", event.id), event, 86400)
            logger.info(
                "meetup.search query=%s city=%s state=%s results=%s has_next=%s",
                query,
                place.city,
                place.state,
                len(events),
                page.page_info.has_next_page,
            )
            return page

        return await self.cached(key, 300, fetch)

    async def get_event_detail(self, event_id):
        event = self.get(("event", event_id))
        if event is None:
            raise MeetupError(
                "detail", "Refresh discovery to load this Meetup event", 404
            )
        return event
