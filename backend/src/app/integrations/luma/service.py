"""Luma service layer providing caching, request coalescing, and domain logic."""

import asyncio
import logging
import time
from typing import Any, Callable, Coroutine

from app.core.config import settings
from app.integrations.luma.client import LumaClient
from app.integrations.luma.normalize import normalize_luma_event
from app.integrations.luma.place_resolver import LumaPlaceResolver
from app.integrations.luma.schemas import (
    LumaDiscoverPlace,
    LumaEventsPage,
    NormalizedLumaEvent,
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

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()


class LumaService:
    """Service coordinating discovery, resolution, caching, and normalization."""

    def __init__(
        self,
        client: LumaClient | None = None,
        place_resolver: LumaPlaceResolver | None = None,
        cache: TTLCache | None = None,
    ) -> None:
        self.client = client or LumaClient(
            api_origin=settings.LUMA_API_ORIGIN,
            web_origin=settings.LUMA_WEB_ORIGIN,
            timeout=settings.LUMA_TIMEOUT_SECONDS,
            max_retries=settings.LUMA_MAX_RETRIES,
        )
        self.place_resolver = place_resolver or LumaPlaceResolver(self.client)
        self.cache = cache or TTLCache()
        self._in_flight: dict[str, asyncio.Future[Any]] = {}
        self._in_flight_lock = asyncio.Lock()

    async def aclose(self) -> None:
        """Clean up underlying resources."""
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

    async def resolve_place(self, slug: str) -> LumaDiscoverPlace:
        """Resolve a city slug into a LumaDiscoverPlace, with caching."""
        clean_slug = slug.strip().lower()
        cache_key = f"luma:place:{clean_slug}"
        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        async def _fetch() -> LumaDiscoverPlace:
            place = await self.place_resolver.resolve(clean_slug)
            await self.cache.set(cache_key, place, settings.LUMA_CACHE_TTL_PLACE)
            return place

        return await self._coalesce(cache_key, _fetch)

    async def search_events(
        self,
        place_id: str,
        query: str | None = None,
        limit: int = 25,
        cursor: str | None = None,
        place: LumaDiscoverPlace | None = None,
    ) -> LumaEventsPage:
        """Search or browse public events within a place_id."""
        clean_query = query.strip() if query else ""
        clean_cursor = cursor.strip() if cursor else ""
        cache_key = f"luma:search:{place_id}:{clean_query}:{limit}:{clean_cursor}"

        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        async def _fetch() -> LumaEventsPage:
            data = await self.client.get_paginated_events(
                place_id=place_id,
                query=clean_query or None,
                limit=limit,
                cursor=clean_cursor or None,
            )

            raw_entries = data.get("entries") or []
            normalized_items: list[NormalizedLumaEvent] = []
            for entry in raw_entries:
                if isinstance(entry, dict):
                    normalized_items.append(
                        normalize_luma_event(entry, fallback_place=place)
                    )

            has_more = bool(data.get("has_more", False))
            next_cursor = data.get("next_cursor")

            page = LumaEventsPage(
                items=normalized_items,
                events=normalized_items,
                has_more=has_more,
                next_cursor=next_cursor,
                place=place,
                total=len(normalized_items),
            )
            ttl = settings.LUMA_CACHE_TTL_EVENTS
            await self.cache.set(cache_key, page, ttl)
            return page

        return await self._coalesce(cache_key, _fetch)

    async def get_events(
        self,
        city: str | None = None,
        place_id: str | None = None,
        query: str | None = None,
        limit: int = 25,
        cursor: str | None = None,
    ) -> LumaEventsPage:
        """Primary event discovery entrypoint.

        Automatically resolves city slug to place_id if place_id is not provided.
        Defaults to settings.LUMA_DEFAULT_CITY ('dallas').
        """
        resolved_place: LumaDiscoverPlace | None = None

        if not place_id:
            target = (
                city.strip() if city and city.strip() else settings.LUMA_DEFAULT_CITY
            )
            resolved_place = await self.resolve_place(target)
            effective_place_id = resolved_place.id
        else:
            effective_place_id = place_id.strip()

        page = await self.search_events(
            place_id=effective_place_id,
            query=query,
            limit=limit,
            cursor=cursor,
            place=resolved_place,
        )
        if resolved_place and page.place is None:
            page.place = resolved_place
        return page

    async def get_event_detail(self, event_id: str) -> NormalizedLumaEvent:
        """Retrieve and normalize full event detail for a specific evt-* ID."""
        clean_id = event_id.strip()
        cache_key = f"luma:event:{clean_id}"

        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        async def _fetch() -> NormalizedLumaEvent:
            data = await self.client.get_event(clean_id)
            normalized = normalize_luma_event(data)
            ttl = settings.LUMA_CACHE_TTL_EVENT_DETAIL
            await self.cache.set(cache_key, normalized, ttl)
            return normalized

        return await self._coalesce(cache_key, _fetch)
