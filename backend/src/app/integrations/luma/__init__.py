"""Luma integration module for discovering and normalizing public events."""

from functools import lru_cache

from app.integrations.luma.client import LumaClient
from app.integrations.luma.errors import (
    LumaError,
    LumaEventNotFoundError,
    LumaParseError,
    LumaPlaceNotFoundError,
    LumaRateLimitError,
    LumaUpstreamError,
)
from app.integrations.luma.normalize import normalize_luma_event, normalize_luma_place
from app.integrations.luma.place_resolver import LumaPlaceResolver
from app.integrations.luma.schemas import (
    LumaDiscoverPlace,
    LumaEventsPage,
    NormalizedLumaEvent,
)
from app.integrations.luma.service import LumaService


@lru_cache(maxsize=1)
def get_luma_service() -> LumaService:
    """FastAPI dependency provider for the singleton LumaService."""
    return LumaService()


__all__ = [
    "LumaClient",
    "LumaService",
    "LumaPlaceResolver",
    "LumaError",
    "LumaPlaceNotFoundError",
    "LumaEventNotFoundError",
    "LumaRateLimitError",
    "LumaParseError",
    "LumaUpstreamError",
    "LumaDiscoverPlace",
    "NormalizedLumaEvent",
    "LumaEventsPage",
    "normalize_luma_event",
    "normalize_luma_place",
    "get_luma_service",
]
