"""Typed exceptions for Luma integration."""


class LumaError(Exception):
    """Base exception for all Luma integration errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class LumaPlaceNotFoundError(LumaError):
    """Raised when a city slug cannot be resolved to a Luma discover place."""

    def __init__(self, slug: str, detail: str = "Discover place not found"):
        super().__init__(f"Luma place '{slug}' not found: {detail}", status_code=404)
        self.slug = slug


class LumaEventNotFoundError(LumaError):
    """Raised when an event ID cannot be found on Luma."""

    def __init__(self, event_id: str, detail: str = "Event not found"):
        super().__init__(
            f"Luma event '{event_id}' not found: {detail}", status_code=404
        )
        self.event_id = event_id


class LumaRateLimitError(LumaError):
    """Raised when Luma returns HTTP 429 Too Many Requests."""

    def __init__(self, retry_after: float | None = None):
        super().__init__("Luma upstream rate limit exceeded", status_code=429)
        self.retry_after = retry_after


class LumaParseError(LumaError):
    """Raised when unexpected structure is encountered while parsing Luma responses."""

    def __init__(self, detail: str):
        super().__init__(f"Failed to parse Luma response: {detail}", status_code=502)


class LumaUpstreamError(LumaError):
    """Raised when upstream Luma servers return 5xx or unhandled status codes."""

    def __init__(self, status_code: int, detail: str = ""):
        super().__init__(
            f"Luma upstream service error (HTTP {status_code}): {detail}".strip(),
            status_code=502,
        )
        self.upstream_status = status_code
