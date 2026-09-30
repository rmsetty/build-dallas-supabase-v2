"""Bounded startup discovery across Luma keyword searches."""

import asyncio
from datetime import UTC, datetime

from pydantic import Field

from app.integrations.luma.errors import LumaError, LumaUpstreamError
from app.integrations.luma.schemas import CamelModel, NormalizedLumaEvent
from app.integrations.luma.service import LumaService
from app.services.event_relevance import DEFAULT_QUERIES, startup_relevant


class StartupEvents(CamelModel):
    items: list[NormalizedLumaEvent]
    queries: list[str]
    failed_queries: list[str] = Field(default_factory=list)
    incomplete: bool = False
    fetched_at: str


def relevant(event: NormalizedLumaEvent) -> bool:
    return startup_relevant(
        event.title,
        event.description,
        event.organizer.name if event.organizer else None,
    )


def upcoming(event: NormalizedLumaEvent, now: datetime) -> bool:
    try:
        start = datetime.fromisoformat(event.start_at.replace("Z", "+00:00"))
        return start.tzinfo is not None and start >= now
    except ValueError:
        return False


async def discover_startups(
    service: LumaService, city: str, queries: list[str]
) -> StartupEvents:
    queries = list(dict.fromkeys(q.strip().lower() for q in queries if q.strip()))
    if not queries:
        queries = [q.lower() for q in DEFAULT_QUERIES]
    city = city.strip().lower() or "dallas"
    key = f"luma:startup:{city}:{','.join(sorted(queries))}"
    cached = await service.cache.get(key)
    if cached is not None:
        return cached

    async def fetch() -> StartupEvents:
        place = await service.resolve_place(city)
        semaphore = asyncio.Semaphore(4)

        async def search(keyword: str):
            items = []
            cursor = None
            # At most 100 results per keyword; explicitly surface truncation.
            for _ in range(2):
                async with semaphore:
                    page = await service.search_events(
                        place.id, keyword, 50, cursor, place
                    )
                items.extend(page.items)
                if not page.has_more:
                    return items, False
                if not page.next_cursor or page.next_cursor == cursor:
                    return items, True
                cursor = page.next_cursor
            return items, True

        results = await asyncio.gather(
            *(asyncio.wait_for(search(q), timeout=20) for q in queries),
            return_exceptions=True,
        )
        failed = []
        incomplete = False
        candidates = {}
        for keyword, result in zip(queries, results):
            if isinstance(result, BaseException):
                if not isinstance(result, (LumaError, TimeoutError)):
                    raise result
                failed.append(keyword)
                continue
            items, truncated = result
            incomplete |= truncated
            for event in items:
                if event.id:
                    candidates[event.id] = event
        if len(failed) == len(queries):
            raise LumaUpstreamError(503, "Startup discovery is temporarily unavailable")
        now = datetime.now(UTC)
        ordered = sorted(
            (e for e in candidates.values() if upcoming(e, now)),
            key=lambda e: (
                datetime.fromisoformat(e.start_at.replace("Z", "+00:00")),
                e.id,
            ),
        )
        accepted = [e for e in ordered if relevant(e)]
        ambiguous = [e for e in ordered if not relevant(e)]
        # Descriptions are not present in discovery listings. Hydrate ambiguous
        # matches instead of accepting unrelated keyword hits.
        incomplete |= len(ambiguous) > 40

        async def detail(event):
            async with semaphore:
                return await service.get_event_detail(event.id)

        details = await asyncio.gather(
            *(asyncio.wait_for(detail(e), timeout=15) for e in ambiguous[:40]),
            return_exceptions=True,
        )
        for event in details:
            if isinstance(event, BaseException):
                if not isinstance(event, (LumaError, TimeoutError)):
                    raise event
                incomplete = True
            elif upcoming(event, now) and relevant(event):
                accepted.append(event)
        accepted = list({event.id: event for event in accepted}.values())
        accepted.sort(
            key=lambda e: (
                datetime.fromisoformat(e.start_at.replace("Z", "+00:00")),
                e.id,
            )
        )
        response = StartupEvents(
            items=accepted,
            queries=queries,
            failed_queries=failed,
            incomplete=incomplete or bool(failed),
            fetched_at=now.isoformat(),
        )
        await service.cache.set(key, response, 30 if response.incomplete else 300)
        return response

    return await service._coalesce(key, fetch)
