"""Eventbrite integration module for discovering public destination events."""

from functools import lru_cache

from app.integrations.eventbrite.bootstrap import EventbriteBootstrapper
from app.integrations.eventbrite.client import EventbriteClient
from app.integrations.eventbrite.errors import (
    EventbriteCSRFError,
    EventbriteError,
    EventbriteEventNotFoundError,
    EventbriteParseError,
    EventbritePlaceNotFoundError,
    EventbriteRateLimitError,
    EventbriteUpstreamError,
)
from app.integrations.eventbrite.normalize import normalize_eventbrite_event
from app.integrations.eventbrite.schemas import (
    EventbriteBootstrap,
    EventbritePagination,
    EventbriteSearchPage,
    NormalizedEventbriteEvent,
)
from app.integrations.eventbrite.service import EventbriteService


@lru_cache(maxsize=1)
def get_eventbrite_service() -> EventbriteService:
    """FastAPI dependency provider for the singleton EventbriteService."""
    return EventbriteService()


__all__ = [
    "EventbriteClient",
    "EventbriteService",
    "EventbriteBootstrapper",
    "EventbriteError",
    "EventbritePlaceNotFoundError",
    "EventbriteEventNotFoundError",
    "EventbriteCSRFError",
    "EventbriteRateLimitError",
    "EventbriteParseError",
    "EventbriteUpstreamError",
    "EventbriteBootstrap",
    "NormalizedEventbriteEvent",
    "EventbritePagination",
    "EventbriteSearchPage",
    "normalize_eventbrite_event",
    "get_eventbrite_service",
]
