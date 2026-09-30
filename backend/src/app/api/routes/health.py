"""Health check endpoint for container liveness and client verification."""

from fastapi import APIRouter

from app.core.config import settings
from app.models import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Report process liveness without requiring external service connectivity."""
    return HealthResponse(
        status="ok",
        service=settings.SERVICE_NAME,
    )
