"""Resolver for discovering Luma places from public city pages."""

import json
import logging
import re
from typing import Any

from app.integrations.luma.client import LumaClient
from app.integrations.luma.errors import (
    LumaParseError,
    LumaPlaceNotFoundError,
)
from app.integrations.luma.normalize import normalize_luma_place
from app.integrations.luma.schemas import LumaDiscoverPlace

logger = logging.getLogger(__name__)

NEXT_DATA_REGEX = re.compile(
    r"""<script\s+id=["']__NEXT_DATA__["']\s+type=["']application/json["'][^>]*>(.*?)</script>""",
    re.DOTALL | re.IGNORECASE,
)


def extract_next_data(html: str) -> dict[str, Any]:
    """Extract and parse the __NEXT_DATA__ JSON script from HTML."""
    match = NEXT_DATA_REGEX.search(html)
    if not match:
        raise LumaParseError(
            "Could not find __NEXT_DATA__ script tag in Luma place page HTML"
        )

    script_content = match.group(1).strip()
    try:
        return json.loads(script_content)
    except Exception as exc:
        raise LumaParseError(f"Failed to decode __NEXT_DATA__ JSON: {exc}") from exc


class LumaPlaceResolver:
    """Resolves city slugs (e.g. 'dallas') to Luma discover places."""

    def __init__(self, client: LumaClient):
        self.client = client

    async def resolve(self, slug: str) -> LumaDiscoverPlace:
        """Fetch and extract public discover place information from a city page."""
        clean_slug = slug.strip().strip("/").lower()
        if not clean_slug:
            raise LumaPlaceNotFoundError(slug, "Empty slug provided")

        html = await self.client.fetch_place_html(clean_slug)
        next_data = extract_next_data(html)

        initial_data = (
            next_data.get("props", {}).get("pageProps", {}).get("initialData")
        )

        if not isinstance(initial_data, dict):
            raise LumaPlaceNotFoundError(
                clean_slug, "Page data does not contain initialData object"
            )

        kind = initial_data.get("kind")
        if kind != "discover-place":
            raise LumaPlaceNotFoundError(
                clean_slug, f"Page is not a discover place (kind was '{kind}')"
            )

        place_data = initial_data.get("data", {}).get("place")
        if not isinstance(place_data, dict) or not place_data.get("api_id"):
            raise LumaPlaceNotFoundError(clean_slug, "Place data missing api_id")

        return normalize_luma_place(place_data)
