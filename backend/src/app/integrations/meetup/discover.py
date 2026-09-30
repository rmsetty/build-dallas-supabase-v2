"""Bounded keyword discovery with the existing cross-source relevance policy."""

import asyncio
from datetime import UTC, datetime

from app.services.event_relevance import startup_relevant

from .errors import MeetupError
from .schemas import StartupEvents


async def discover_startups(service, location, queries):
    queries = list(dict.fromkeys(q.strip().lower() for q in queries))

    async def fetch():
        start = datetime.now(UTC)

        async def search(query):
            items, cursor, seen = [], None, set()
            for _ in range(2):
                page = await service.get_events(query, location, cursor, start_at=start)
                items.extend(page.items)
                info = page.page_info
                if not info.has_next_page:
                    return items, False
                if not info.end_cursor or info.end_cursor in seen:
                    return items, True
                cursor = info.end_cursor
                seen.add(cursor)
            return items, True

        results = await asyncio.gather(
            *(asyncio.wait_for(search(q), 45) for q in queries), return_exceptions=True
        )
        failed, events, incomplete = [], {}, False
        for query, result in zip(queries, results):
            if isinstance(result, BaseException):
                if not isinstance(result, (MeetupError, TimeoutError)):
                    raise result
                failed.append(query)
                continue
            items, truncated = result
            incomplete |= truncated
            for event in items:
                if datetime.fromisoformat(event.start_at) >= start and startup_relevant(
                    event.title,
                    event.description,
                    event.organizer.name if event.organizer else None,
                ):
                    events[event.id] = event
        if len(failed) == len(queries):
            raise MeetupError(
                "discover", "Meetup discovery is temporarily unavailable", 503
            )
        return StartupEvents(
            items=sorted(
                events.values(),
                key=lambda e: (datetime.fromisoformat(e.start_at), e.id),
            ),
            queries=queries,
            failed_queries=failed,
            incomplete=incomplete or bool(failed),
            fetched_at=start.isoformat(),
        )

    return await service.cached(("discover", location, tuple(queries)), 300, fetch)
