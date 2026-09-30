"""Typed exceptions for Eventbrite integration."""


class EventbriteError(Exception):
    """Base exception for all Eventbrite integration errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class EventbritePlaceNotFoundError(EventbriteError):
    """Raised when an Eventbrite location slug cannot be resolved to a place ID."""

    def __init__(self, slug: str, detail: str = "Location place ID not found"):
        super().__init__(
            f"Eventbrite location '{slug}' not found: {detail}",
            status_code=404,
        )
        self.slug = slug


class EventbriteEventNotFoundError(EventbriteError):
    """Raised when an Eventbrite event cannot be found."""

    def __init__(self, event_id: str, detail: str = "Event not found"):
        super().__init__(
            f"Eventbrite event '{event_id}' not found: {detail}",
            status_code=404,
        )
        self.event_id = event_id


class EventbriteCSRFError(EventbriteError):
    """Raised when Eventbrite rejects a request due to missing/invalid CSRF token."""

    def __init__(self, detail: str = "Invalid or expired CSRF token"):
        super().__init__(
            f"Eventbrite CSRF verification failed: {detail}", status_code=403
        )


class EventbriteRateLimitError(EventbriteError):
    """Raised when Eventbrite returns HTTP 429 Too Many Requests."""

    def __init__(self, retry_after: float | None = None):
        super().__init__("Eventbrite upstream rate limit exceeded", status_code=429)
        self.retry_after = retry_after


class EventbriteParseError(EventbriteError):
    """Raised when Eventbrite HTML or JSON payload cannot be parsed."""

    def __init__(self, detail: str):
        super().__init__(
            f"Failed to parse Eventbrite payload: {detail}", status_code=502
        )


class EventbriteUpstreamError(EventbriteError):
    """Raised when upstream Eventbrite returns 5xx or unhandled status codes."""

    def __init__(self, status_code: int, detail: str = ""):
        super().__init__(
            f"Eventbrite upstream error (HTTP {status_code}): {detail}".strip(),
            status_code=502,
        )
        self.upstream_status = status_code
