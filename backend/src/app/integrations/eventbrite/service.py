"""Eventbrite service layer coordinating search, caching, and normalization."""

import asyncio
import logging
import time
from typing import Any, Callable, Coroutine

from app.core.config import settings
from app.integrations.eventbrite.bootstrap import EventbriteBootstrapper
from app.integrations.eventbrite.client import EventbriteClient
from app.integrations.eventbrite.errors import EventbriteCSRFError
from app.integrations.eventbrite.normalize import normalize_eventbrite_event
from app.integrations.eventbrite.schemas import (
    EventbriteBootstrap,
    EventbritePagination,
    EventbriteSearchPage,
    NormalizedEventbriteEvent,
)

logger = logging.getLogger(__name__)


class TTLCache:
    """Thread-safe, async-friendly in-memory TTL cache with entry expiration."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    async def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        async with self._lock:
            self._store[key] = (time.monotonic() + ttl_seconds, value)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()


class EventbriteService:
    """High-level service coordinating discovery, bootstrapping, and normalization."""

    def __init__(
        self,
        client: EventbriteClient | None = None,
        bootstrapper: EventbriteBootstrapper | None = None,
        cache: TTLCache | None = None,
    ) -> None:
        self.client = client or EventbriteClient(
            api_origin=settings.EVENTBRITE_API_ORIGIN,
            timeout=settings.EVENTBRITE_TIMEOUT_SECONDS,
            max_retries=settings.EVENTBRITE_MAX_RETRIES,
        )
        self.bootstrapper = bootstrapper or EventbriteBootstrapper(self.client)
        self.cache = cache or TTLCache()
        self._in_flight: dict[str, asyncio.Future[Any]] = {}
        self._in_flight_lock = asyncio.Lock()

    async def aclose(self) -> None:
        """Clean up client resources."""
        await self.client.aclose()

    async def _coalesce(
        self, key: str, coro_fn: Callable[[], Coroutine[Any, Any, Any]]
    ) -> Any:
        """Prevent duplicate simultaneous calls for the same key (Singleflight)."""
        async with self._in_flight_lock:
            if key in self._in_flight:
                future = self._in_flight[key]
            else:
                loop = asyncio.get_running_loop()
                future = loop.create_future()
                self._in_flight[key] = future
                asyncio.create_task(self._run_coalesced(key, future, coro_fn))

        return await asyncio.shield(future)

    async def _run_coalesced(
        self,
        key: str,
        future: asyncio.Future[Any],
        coro_fn: Callable[[], Coroutine[Any, Any, Any]],
    ) -> None:
        try:
            result = await coro_fn()
            if not future.done():
                future.set_result(result)
        except Exception as exc:
            if not future.done():
                future.set_exception(exc)
        finally:
            async with self._in_flight_lock:
                self._in_flight.pop(key, None)

    async def get_bootstrap(
        self, location_slug: str, force_refresh: bool = False
    ) -> EventbriteBootstrap:
        """Fetch and cache public bootstrap metadata and CSRF token for a location."""
        clean_slug = location_slug.strip().lower()
        cache_key = f"eventbrite:bootstrap:{clean_slug}"

        if not force_refresh:
            cached = await self.cache.get(cache_key)
            if cached is not None:
                return cached

        async def _fetch() -> EventbriteBootstrap:
            bootstrap = await self.bootstrapper.bootstrap(clean_slug)
            await self.cache.set(
                cache_key, bootstrap, settings.EVENTBRITE_CACHE_TTL_BOOTSTRAP
            )
            # Also cache slug -> place_id for longer
            await self.cache.set(
                f"eventbrite:place:{clean_slug}",
                bootstrap.place_id,
                settings.EVENTBRITE_CACHE_TTL_PLACE,
            )
            return bootstrap

        return await self._coalesce(cache_key, _fetch)

    async def search_events(
        self,
        place_id: str,
        query: str = "",
        page: int = 1,
        page_size: int = 20,
        csrf_token: str = "",
        csrf_cookie: str | None = None,
        location_slug: str | None = None,
        bootstrap: EventbriteBootstrap | None = None,
    ) -> EventbriteSearchPage:
        """Search organic public events, ignoring all promoted results."""
        clean_query = query.strip()
        cache_key = f"eventbrite:search:{place_id}:{clean_query}:{page}:{page_size}"

        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        async def _fetch() -> EventbriteSearchPage:
            current_token = csrf_token
            current_cookie = csrf_cookie
            referer = (
                f"{self.client.api_origin}/d/{location_slug}/{clean_query or 'events'}/"
                if location_slug
                else None
            )

            try:
                data = await self.client.search_destination(
                    place_id=place_id,
                    query=clean_query,
                    page=page,
                    page_size=page_size,
                    csrf_token=current_token,
                    csrf_cookie=current_cookie,
                    referer=referer,
                )
            except EventbriteCSRFError:
                # Refresh bootstrap CSRF and retry once if location_slug is available
                if location_slug:
                    logger.warning(
                        "CSRF token expired for location '%s'. Refreshing bootstrap...",
                        location_slug,
                    )
                    refreshed = await self.get_bootstrap(
                        location_slug, force_refresh=True
                    )
                    current_token = refreshed.csrf_token
                    current_cookie = refreshed.csrf_cookie
                    data = await self.client.search_destination(
                        place_id=place_id,
                        query=clean_query,
                        page=page,
                        page_size=page_size,
                        csrf_token=current_token,
                        csrf_cookie=current_cookie,
                        referer=referer,
                    )
                else:
                    raise

            # Unwrap events container if present
            events_dict = (
                data.get("events") if isinstance(data.get("events"), dict) else data
            )
            raw_results = events_dict.get("results") or []

            # STRICT AD ISOLATION: promoted_results are explicitly ignored
            normalized: list[NormalizedEventbriteEvent] = []
            for item in raw_results:
                if isinstance(item, dict):
                    normalized.append(normalize_eventbrite_event(item))

            raw_pagination = events_dict.get("pagination") or {}
            pagination = EventbritePagination(
                page=raw_pagination.get("page_number", page),
                page_size=raw_pagination.get("page_size", page_size),
                page_count=raw_pagination.get("page_count"),
                object_count=raw_pagination.get("object_count"),
                continuation=raw_pagination.get("continuation"),
            )

            search_page = EventbriteSearchPage(
                events=normalized,
                items=normalized,
                pagination=pagination,
                place=bootstrap,
            )
            await self.cache.set(
                cache_key, search_page, settings.EVENTBRITE_CACHE_TTL_SEARCH
            )
            return search_page

        return await self._coalesce(cache_key, _fetch)

    async def get_events(
        self,
        location: str | None = None,
        query: str | None = None,
        place_id: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> EventbriteSearchPage:
        """High-level discovery entrypoint resolving location and searching events."""
        effective_location = (
            location.strip().lower()
            if location and location.strip()
            else settings.EVENTBRITE_DEFAULT_LOCATION
        )

        bootstrap = await self.get_bootstrap(effective_location)
        effective_place_id = (
            place_id.strip() if place_id and place_id.strip() else bootstrap.place_id
        )

        return await self.search_events(
            place_id=effective_place_id,
            query=query or "",
            page=page,
            page_size=page_size,
            csrf_token=bootstrap.csrf_token,
            csrf_cookie=bootstrap.csrf_cookie,
            location_slug=effective_location,
            bootstrap=bootstrap,
        )

    async def get_event_detail(self, event_id: str) -> NormalizedEventbriteEvent:
        key = f"eventbrite:event:{event_id}"
        cached = await self.cache.get(key)
        if cached is not None:
            return cached

        async def fetch():
            event = normalize_eventbrite_event(await self.client.get_event(event_id))
            await self.cache.set(key, event, settings.EVENTBRITE_CACHE_TTL_SEARCH)
            return event

        return await self._coalesce(key, fetch)
