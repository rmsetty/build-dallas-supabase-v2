"""HTTP client for communicating with Luma discovery and web endpoints."""

import asyncio
import logging
import random
import re
from typing import Any

import httpx

from app.integrations.luma.errors import (
    LumaError,
    LumaEventNotFoundError,
    LumaParseError,
    LumaPlaceNotFoundError,
    LumaRateLimitError,
    LumaUpstreamError,
)

logger = logging.getLogger(__name__)

EVENT_ID_REGEX = re.compile(r"^evt-[A-Za-z0-9]+$")


class LumaClient:
    """Resilient, read-only HTTP client for Luma public endpoints."""

    def __init__(
        self,
        api_origin: str = "https://api.luma.com",
        web_origin: str = "https://luma.com",
        timeout: float = 10.0,
        max_retries: int = 3,
        max_concurrency: int = 5,
        client: httpx.AsyncClient | None = None,
    ):
        self.api_origin = api_origin.rstrip("/")
        self.web_origin = web_origin.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
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
                "Accept": "application/json",
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
    ) -> httpx.Response:
        """Execute an HTTP request with bounded retry and backoff."""
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
                    )

                    # Successful response
                    if response.status_code < 400:
                        return response

                    # Non-retryable client errors
                    if response.status_code in (400, 401, 403, 404):
                        return response

                    # Rate limited (429) or transient server errors (5xx)
                    if response.status_code == 429:
                        retry_after_str = response.headers.get("Retry-After")
                        retry_after = (
                            float(retry_after_str)
                            if retry_after_str and retry_after_str.isdigit()
                            else None
                        )
                        if attempt >= self.max_retries:
                            raise LumaRateLimitError(retry_after=retry_after)
                        sleep_time = (
                            retry_after
                            if retry_after is not None
                            else (0.5 * (2 ** (attempt - 1)) + random.uniform(0.1, 0.4))
                        )
                        logger.warning(
                            "Luma rate limit (429). Retrying in %.2fs (attempt %d/%d)",
                            sleep_time,
                            attempt,
                            self.max_retries,
                        )
                        await asyncio.sleep(sleep_time)
                        continue

                    if response.status_code in (500, 502, 503, 504):
                        if attempt >= self.max_retries:
                            raise LumaUpstreamError(
                                response.status_code, response.text[:200]
                            )
                        sleep_time = 0.5 * (2 ** (attempt - 1)) + random.uniform(
                            0.1, 0.4
                        )
                        logger.warning(
                            "Luma %d error. Retrying in %.2fs (attempt %d/%d)",
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
                        raise LumaUpstreamError(
                            504, f"Network/timeout failure: {exc}"
                        ) from exc
                    sleep_time = 0.5 * (2 ** (attempt - 1)) + random.uniform(0.1, 0.4)
                    logger.warning(
                        "Luma network error (%s). Retrying in %.2fs (attempt %d/%d)",
                        exc,
                        sleep_time,
                        attempt,
                        self.max_retries,
                    )
                    await asyncio.sleep(sleep_time)

    async def fetch_place_html(self, slug: str) -> str:
        """Fetch raw HTML of a Luma discover place page without cookies."""
        clean_slug = slug.strip().strip("/")
        url = f"{self.web_origin}/{clean_slug}"
        response = await self._request_with_retry(
            "GET",
            url,
            headers={"Accept": "text/html,application/xhtml+xml"},
        )
        if response.status_code == 404:
            raise LumaPlaceNotFoundError(clean_slug, "Page returned 404")
        if response.status_code >= 400:
            raise LumaUpstreamError(response.status_code, response.text[:200])
        return response.text

    async def get_paginated_events(
        self,
        place_id: str,
        query: str | None = None,
        limit: int = 25,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        """Search or browse public events within a discover place."""
        params: dict[str, Any] = {
            "discover_place_api_id": place_id,
            "pagination_limit": limit,
        }
        if query and query.strip():
            params["query"] = query.strip()
        if cursor and cursor.strip():
            params["pagination_cursor"] = cursor.strip()

        url = f"{self.api_origin}/discover/get-paginated-events"
        response = await self._request_with_retry(
            "GET",
            url,
            params=params,
            headers={"Accept": "application/json"},
        )

        if response.status_code == 404:
            return {"entries": [], "has_more": False, "next_cursor": None}
        if response.status_code >= 400:
            raise LumaUpstreamError(response.status_code, response.text[:200])

        try:
            return response.json()
        except Exception as exc:
            raise LumaParseError(f"Failed to decode JSON from {url}: {exc}") from exc

    async def get_event(self, event_id: str) -> dict[str, Any]:
        """Fetch full detail for a specific event by evt-* ID."""
        clean_id = event_id.strip()
        if not EVENT_ID_REGEX.match(clean_id):
            raise LumaError(
                f"Invalid Luma event ID format: '{event_id}'", status_code=400
            )

        url = f"{self.api_origin}/event/get"
        response = await self._request_with_retry(
            "GET",
            url,
            params={"event_api_id": clean_id},
            headers={"Accept": "application/json"},
        )

        if response.status_code == 404:
            raise LumaEventNotFoundError(clean_id)
        if response.status_code >= 400:
            raise LumaUpstreamError(response.status_code, response.text[:200])

        try:
            return response.json()
        except Exception as exc:
            raise LumaParseError(f"Failed to decode JSON from {url}: {exc}") from exc
