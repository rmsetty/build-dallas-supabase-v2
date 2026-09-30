"""Unauthenticated public-web persisted queries, isolated from application code."""

import asyncio
import logging
import os
import random
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from .errors import (
    MeetupError,
    MeetupGraphQLError,
    MeetupPersistedQueryError,
    MeetupSchemaError,
)

logger = logging.getLogger(__name__)
OPERATIONS = {
    "getLocationSearch": os.getenv(
        "MEETUP_LOCATION_HASH",
        "950b939f7033b26849b13e829e04cad7fb6b6e4593e97499fceb3ff21764206d",
    ),
    "eventSearchWithSeries": os.getenv(
        "MEETUP_SEARCH_HASH",
        "e23460c42028dfbc0d9c24b97fb52378b9e022899d94011f737b65d13bb9a0d2",
    ),
}


def date_variables(start, timezone):
    if start.tzinfo is None:
        raise ValueError("Search start must be timezone aware")
    try:
        zone = ZoneInfo(timezone or "UTC")
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("UTC")
    local = start.astimezone(zone)
    return {
        "startDateRange": local.isoformat(timespec="seconds") + f"[{zone.key}]",
        "seriesStartDate": local.date().isoformat(),
    }


class MeetupClient:
    def __init__(self, transport=None, retries=2):
        self.http = httpx.AsyncClient(transport=transport, timeout=10)
        self.semaphore = asyncio.Semaphore(3)
        self.retries = retries

    async def aclose(self):
        await self.http.aclose()

    async def execute(self, operation, variables):
        body = {
            "operationName": operation,
            "variables": variables,
            "extensions": {
                "persistedQuery": {"version": 1, "sha256Hash": OPERATIONS[operation]}
            },
        }
        for attempt in range(self.retries + 1):
            started = time.monotonic()
            retry_after = 0
            try:
                async with self.semaphore:
                    # Build a fresh request to exclude even anonymous Set-Cookie state.
                    request = httpx.Request(
                        "POST",
                        "https://www.meetup.com/gql2",
                        json=body,
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "apollographql-client-name": "nextjs-web",
                            "Origin": "https://www.meetup.com",
                            "Referer": "https://www.meetup.com/find/",
                        },
                        extensions={
                            "timeout": {
                                "connect": 10,
                                "read": 10,
                                "write": 10,
                                "pool": 10,
                            }
                        },
                    )
                    response = await self.http.send(request)
                logger.info(
                    "meetup.request operation=%s status=%s retry=%s duration=%.3f",
                    operation,
                    response.status_code,
                    attempt,
                    time.monotonic() - started,
                )
                if response.status_code in (429, 500, 502, 503, 504):
                    header = response.headers.get("Retry-After", "0")
                    try:
                        retry_after = max(0, float(header))
                    except ValueError:
                        try:
                            retry_after = max(
                                0,
                                (
                                    parsedate_to_datetime(header) - datetime.now(UTC)
                                ).total_seconds(),
                            )
                        except (ValueError, TypeError):
                            retry_after = 0
                    if attempt == self.retries or retry_after > 15:
                        raise MeetupError(
                            operation, "Meetup is temporarily unavailable", 503
                        )
                elif not response.is_success:
                    raise MeetupError(operation, "Meetup rejected the public request")
                else:
                    try:
                        data = response.json()
                    except ValueError as exc:
                        raise MeetupSchemaError(
                            operation, "Meetup returned invalid JSON"
                        ) from exc
                    if not isinstance(data, dict):
                        raise MeetupSchemaError(operation, "Meetup response changed")
                    if data.get("errors"):
                        errors = data["errors"]
                        messages = (
                            [
                                str(e.get("message", "GraphQL error"))
                                for e in errors
                                if isinstance(e, dict)
                            ]
                            if isinstance(errors, list)
                            else ["GraphQL error"]
                        )
                        persisted = "persistedquery" in str(errors).lower().replace(
                            "_", ""
                        )
                        error_type = (
                            MeetupPersistedQueryError
                            if persisted
                            else MeetupGraphQLError
                        )
                        logger.error(
                            "meetup.%s operation=%s",
                            "persisted_query_error" if persisted else "graphql_error",
                            operation,
                        )
                        error = error_type(
                            operation, "; ".join(messages), response.status_code
                        )
                        raise error
                    if not isinstance(data.get("data"), dict):
                        raise MeetupSchemaError(
                            operation, "Meetup response data missing"
                        )
                    return data["data"]
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == self.retries:
                    raise MeetupError(
                        operation, "Meetup request timed out", 503
                    ) from exc
            await asyncio.sleep(
                max(retry_after, 0.3 * 2**attempt + random.uniform(0, 0.2))
            )

    async def search_locations(self, query):
        return await self.execute(
            "getLocationSearch",
            {
                "query": query,
                "dataConfiguration": "{}",
                "useImprovedGeoHashIndex": False,
            },
        )

    async def search_events(self, query, location, first=12, after=None, start_at=None):
        variables = dict(
            first=first,
            lat=location.latitude,
            lon=location.longitude,
            city=location.city,
            state=location.state,
            country=location.country,
            zip=location.zip,
            query=query,
            sortField="RELEVANCE",
            doConsolidateEvents=True,
            numberOfEventsForSeries=5,
            dataConfiguration='{"isSimplifiedSearchEnabled":true,"include_events_from_user_chapters":true}',
        )
        variables.update(
            date_variables(start_at or datetime.now(UTC), location.timezone)
        )
        if after is not None:
            variables["after"] = after  # Opaque conventional connection cursor.
        return await self.execute("eventSearchWithSeries", variables)
