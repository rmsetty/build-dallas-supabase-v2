"""HTTP client for Eventbrite public discovery and search endpoints."""

import asyncio
import logging
import random
import re
import uuid
from typing import Any

import httpx

from app.integrations.eventbrite.errors import (
    EventbriteCSRFError,
    EventbriteEventNotFoundError,
    EventbriteParseError,
    EventbritePlaceNotFoundError,
    EventbriteRateLimitError,
    EventbriteUpstreamError,
)

logger = logging.getLogger(__name__)


class EventbriteClient:
    """Read-only HTTP client communicating with public Eventbrite endpoints."""

    def __init__(
        self,
        api_origin: str = "https://www.eventbrite.com",
        timeout: float = 12.0,
        max_retries: int = 3,
        max_concurrency: int = 5,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_origin = api_origin.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.stable_id = str(uuid.uuid4())
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._external_client = client is not None
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/128.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/json",
            },
            follow_redirects=True,
        )

    async def aclose(self) -> None:
        """Close internal HTTP client if owned."""
        if not self._external_client:
            await self._client.aclose()

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        json_body: Any | None = None,
    ) -> httpx.Response:
        """Execute request with bounded retry on transient 429 and 5xx errors."""
        async with self._semaphore:
            attempt = 0
            while True:
                attempt += 1
                try:
                    response = await self._client.request(
                        method,
                        url,
                        params=params,
                        headers=headers,
                        json=json_body,
                    )

                    if response.status_code < 400:
                        return response

                    if response.status_code in (400, 401, 403, 404):
                        return response

                    if response.status_code == 429:
                        retry_after_str = response.headers.get("Retry-After")
                        retry_after = (
                            float(retry_after_str)
                            if retry_after_str and retry_after_str.isdigit()
                            else None
                        )
                        if attempt >= self.max_retries:
                            raise EventbriteRateLimitError(retry_after=retry_after)
                        sleep_time = (
                            retry_after
                            if retry_after is not None
                            else (0.5 * (2 ** (attempt - 1)) + random.uniform(0.1, 0.4))
                        )
                        logger.warning(
                            "Eventbrite 429. Retrying in %.2fs (attempt %d/%d)",
                            sleep_time,
                            attempt,
                            self.max_retries,
                        )
                        await asyncio.sleep(sleep_time)
                        continue

                    if response.status_code in (500, 502, 503, 504):
                        if attempt >= self.max_retries:
                            raise EventbriteUpstreamError(
                                response.status_code, response.text[:200]
                            )
                        sleep_time = 0.5 * (2 ** (attempt - 1)) + random.uniform(
                            0.1, 0.4
                        )
                        logger.warning(
                            "Eventbrite %d error. Retrying in %.2fs (attempt %d/%d)",
                            response.status_code,
                            sleep_time,
                            attempt,
                            self.max_retries,
                        )
                        await asyncio.sleep(sleep_time)
                        continue

                    return response

                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt >= self.max_retries:
                        raise EventbriteUpstreamError(
                            504, f"Network/timeout failure: {exc}"
                        ) from exc
                    sleep_time = 0.5 * (2 ** (attempt - 1)) + random.uniform(0.1, 0.4)
                    logger.warning(
                        "Eventbrite error (%s). Retrying in %.2fs (attempt %d/%d)",
                        exc,
                        sleep_time,
                        attempt,
                        self.max_retries,
                    )
                    await asyncio.sleep(sleep_time)

    async def fetch_discovery_page(
        self, location_slug: str, query_slug: str = "events"
    ) -> tuple[str, str | None]:
        """Fetch destination HTML and csrftoken cookie for a location."""
        clean_loc = location_slug.strip().strip("/").lower()
        clean_query = query_slug.strip().strip("/").lower() or "events"
        url = f"{self.api_origin}/d/{clean_loc}/{clean_query}/"

        response = await self._request_with_retry("GET", url)
        if response.status_code == 404:
            raise EventbritePlaceNotFoundError(clean_loc, "Discovery page returned 404")
        if response.status_code >= 400:
            raise EventbriteUpstreamError(response.status_code, response.text[:200])

        csrf_cookie = response.cookies.get("csrftoken")
        return response.text, csrf_cookie

    async def search_destination(
        self,
        place_id: str,
        query: str = "",
        page: int = 1,
        page_size: int = 20,
        csrf_token: str = "",
        csrf_cookie: str | None = None,
        referer: str | None = None,
    ) -> dict[str, Any]:
        """Execute POST /api/v3/destination/search/ with CSRF token."""
        url = f"{self.api_origin}/api/v3/destination/search/"
        params = {"stable_id": self.stable_id}

        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "X-Requested-With": "XMLHttpRequest",
            "Origin": self.api_origin,
            "Referer": referer or f"{self.api_origin}/d/tx--dallas/events/",
        }
        if csrf_cookie:
            headers["Cookie"] = f"csrftoken={csrf_cookie}"

        body: dict[str, Any] = {
            "event_search": {
                "q": query.strip(),
                "dates": "current_future",
                "dedup": True,
                "places": [place_id],
                "page": page,
                "page_size": page_size,
                "aggs": ["places_borough", "places_neighborhood"],
                "online_events_only": False,
            },
            "expand.destination_event": [
                "primary_venue",
                "image",
                "ticket_availability",
                "saves",
                "event_sales_status",
                "primary_organizer",
                "public_collections",
            ],
            "ltr_request_source": "ebui_dsrp_client",
            "browse_surface": "search",
        }

        response = await self._request_with_retry(
            "POST",
            url,
            params=params,
            headers=headers,
            json_body=body,
        )

        if response.status_code in (401, 403) and "CSRF" in response.text:
            raise EventbriteCSRFError(
                f"Upstream CSRF verification failed: {response.text[:100]}"
            )
        if response.status_code == 403:
            raise EventbriteCSRFError("Upstream rejected CSRF token (HTTP 403)")
        if response.status_code == 404:
            return {
                "results": [],
                "pagination": {
                    "page_number": page,
                    "page_size": page_size,
                    "page_count": 0,
                },
            }
        if response.status_code >= 400:
            raise EventbriteUpstreamError(response.status_code, response.text[:200])

        try:
            return response.json()
        except Exception as exc:
            raise EventbriteParseError(f"Failed to decode search JSON: {exc}") from exc

    async def get_event(self, event_id: str) -> dict[str, Any]:
        """Fetch one public destination event using the same expansions as search."""
        if not re.fullmatch(r"[0-9]{1,30}", event_id):
            raise EventbriteEventNotFoundError(event_id)
        response = await self._request_with_retry(
            "GET",
            f"{self.api_origin}/api/v3/destination/events/{event_id}/",
            params={
                "expand": (
                    "primary_venue,image,ticket_availability,"
                    "event_sales_status,primary_organizer"
                )
            },
            headers={"Accept": "application/json"},
        )
        if response.status_code == 404:
            raise EventbriteEventNotFoundError(event_id)
        if response.status_code >= 400:
            raise EventbriteUpstreamError(response.status_code)
        try:
            data = response.json()
        except ValueError as exc:
            raise EventbriteParseError("Invalid event detail JSON") from exc
        if (
            not isinstance(data, dict)
            or str(data.get("eventbrite_event_id") or data.get("id")) != event_id
        ):
            raise EventbriteParseError("Event detail did not match the requested ID")
        return data
