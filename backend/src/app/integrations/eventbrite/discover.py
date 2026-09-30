"""Bounded startup keyword discovery for Eventbrite."""

import asyncio
from datetime import UTC, datetime

from pydantic import Field

from app.integrations.eventbrite.errors import EventbriteError, EventbriteUpstreamError
from app.integrations.eventbrite.schemas import CamelModel, NormalizedEventbriteEvent
from app.integrations.eventbrite.service import EventbriteService
from app.services.event_relevance import DEFAULT_QUERIES, startup_relevant


class EventbriteStartupEvents(CamelModel):
    items: list[NormalizedEventbriteEvent]
    queries: list[str]
    failed_queries: list[str] = Field(default_factory=list)
    incomplete: bool = False
    fetched_at: str


def relevant(event: NormalizedEventbriteEvent) -> bool:
    return startup_relevant(
        event.title,
        event.summary,
        event.organizer.name if event.organizer else None,
        [*event.tags.subcategories, *event.tags.organizer_tags],
    )


async def discover_startups(
    service: EventbriteService, location: str, queries: list[str]
) -> EventbriteStartupEvents:
    queries = list(dict.fromkeys(q.strip().lower() for q in queries if q.strip()))
    if not queries:
        queries = [q.lower() for q in DEFAULT_QUERIES]
    location = location.strip().lower() or "tx--dallas"
    key = f"eventbrite:startup:{location}:{','.join(sorted(queries))}"
    cached = await service.cache.get(key)
    if cached is not None:
        return cached

    async def fetch():
        semaphore = asyncio.Semaphore(3)

        async def search(keyword):
            items = []
            for number in range(1, 3):
                async with semaphore:
                    page = await service.get_events(
                        location=location, query=keyword, page=number, page_size=50
                    )
                items.extend(page.items)
                meta = page.pagination
                has_more = (
                    meta.page < meta.page_count
                    if meta.page_count is not None
                    else bool(meta.continuation)
                )
                if not has_more or not page.items:
                    return items, False
            return items, True

        results = await asyncio.gather(
            *(asyncio.wait_for(search(q), 35) for q in queries),
            return_exceptions=True,
        )
        failed = []
        incomplete = False
        unique = {}
        now = datetime.now(UTC)
        for keyword, result in zip(queries, results):
            if isinstance(result, BaseException):
                if not isinstance(result, (EventbriteError, TimeoutError)):
                    raise result
                failed.append(keyword)
                continue
            items, truncated = result
            incomplete |= truncated
            for event in items:
                try:
                    start = datetime.fromisoformat(
                        event.start_at.replace("Z", "+00:00")
                    )
                except ValueError:
                    continue
                if event.id and start.tzinfo and start >= now and relevant(event):
                    unique[event.id] = event
        if len(failed) == len(queries):
            raise EventbriteUpstreamError(
                503, "Startup discovery is temporarily unavailable"
            )
        items = sorted(
            unique.values(),
            key=lambda e: (
                datetime.fromisoformat(e.start_at.replace("Z", "+00:00")),
                e.id,
            ),
        )
        result = EventbriteStartupEvents(
            items=items,
            queries=queries,
            failed_queries=failed,
            incomplete=incomplete or bool(failed),
            fetched_at=now.isoformat(),
        )
        await service.cache.set(key, result, 30 if result.incomplete else 300)
        return result

    return await service._coalesce(key, fetch)
