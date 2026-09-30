"""Bootstrap place ID and CSRF token from Eventbrite discovery HTML."""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.integrations.eventbrite.client import EventbriteClient
from app.integrations.eventbrite.errors import (
    EventbriteCSRFError,
    EventbriteParseError,
    EventbritePlaceNotFoundError,
)
from app.integrations.eventbrite.schemas import EventbriteBootstrap

logger = logging.getLogger(__name__)

CSRF_REGEX = re.compile(
    r"""name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)""",
    re.IGNORECASE,
)

SERVER_DATA_REGEX = re.compile(
    r"""window\.__SERVER_DATA__\s*=\s*(\{.*?\});(?:\s*window\.|\s*<|\s*\n)""",
    re.DOTALL,
)


def extract_csrf_token(html: str, cookie_token: str | None = None) -> str:
    """Extract public CSRF token from HTML input tag or cookie."""
    match = CSRF_REGEX.search(html)
    if match:
        token = match.group(1).strip()
        if token:
            return token
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    # Fallback to JSON property if embedded
    prop_match = re.search(r"""["']csrfToken["']\s*:\s*["']([^"']+)["']""", html)
    if prop_match:
        return prop_match.group(1).strip()

    raise EventbriteCSRFError("Could not locate public CSRF token in page or cookies")


def extract_server_data(html: str) -> dict[str, Any]:
    """Extract and parse the window.__SERVER_DATA__ JSON object."""
    match = SERVER_DATA_REGEX.search(html)
    if not match:
        # Fallback to simpler regex
        fallback_match = re.search(
            r"""window\.__SERVER_DATA__\s*=\s*(\{.*?\});""", html, re.DOTALL
        )
        if not fallback_match:
            raise EventbriteParseError(
                "Could not find window.__SERVER_DATA__ in Eventbrite HTML"
            )
        match = fallback_match

    raw_json = match.group(1).strip()
    try:
        return json.loads(raw_json)
    except Exception as exc:
        raise EventbriteParseError(
            f"Failed to decode window.__SERVER_DATA__ JSON: {exc}"
        ) from exc


class EventbriteBootstrapper:
    """Bootstraps place IDs and CSRF tokens from Eventbrite location pages."""

    def __init__(self, client: EventbriteClient) -> None:
        self.client = client

    async def bootstrap(
        self, location_slug: str, query_slug: str = "events"
    ) -> EventbriteBootstrap:
        """Fetch discovery page and extract bootstrap metadata."""
        clean_slug = location_slug.strip().lower()
        html, csrf_cookie = await self.client.fetch_discovery_page(
            clean_slug, query_slug
        )

        csrf_token = extract_csrf_token(html, csrf_cookie)
        server_data = extract_server_data(html)

        place_id = server_data.get("placeId")
        if not place_id:
            # Check inside search_data.event_search.places
            places = (
                server_data.get("search_data", {}).get("event_search", {}).get("places")
            )
            if places and isinstance(places, list):
                place_id = str(places[0])

        if not place_id:
            raise EventbritePlaceNotFoundError(
                clean_slug, "No placeId found in server data"
            )

        return EventbriteBootstrap(
            place_id=str(place_id),
            place_name=server_data.get("currentPlace"),
            place_type=server_data.get("place_type"),
            location_slug=clean_slug,
            csrf_token=csrf_token,
            csrf_cookie=csrf_cookie,
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )
