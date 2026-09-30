"""Worker routes. Provider aggregation runs offline, never on app requests."""

from fastapi import APIRouter

from app.api.routes import bootstrap, community, health, provider_catalog

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(bootstrap.router)
api_router.include_router(community.router)
api_router.include_router(provider_catalog.router)
