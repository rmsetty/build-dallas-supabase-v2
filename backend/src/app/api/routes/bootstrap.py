"""One startup round trip, sharing only public catalog cache entries."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.request_context import RequestContext, optional_context
from app.services.catalog import CatalogService
from app.services.community import CommunityService
from app.services.for_you import ForYouService
from app.storage.cloudflare import CloudStorage, get_storage

router = APIRouter(tags=["bootstrap"])
Storage = Annotated[CloudStorage, Depends(get_storage)]


@router.get("/bootstrap")
async def bootstrap(
    storage: Storage,
    response: Response,
    context: Annotated[RequestContext | None, Depends(optional_context)],
):
    catalog = CatalogService(storage)
    community = CommunityService(storage)
    home, discover, events = await asyncio.gather(
        catalog.page(),
        catalog.page(startup=True),
        community.list_events(None, 20, None),
    )
    # Personal slice rides this existing request, so For You adds no app-open calls.
    personal = (
        await ForYouService(storage).first_page(context.user_id)
        if context
        else {"for_you": None, "interests": None}
    )
    # User identity/profile is assembled after public cache lookup, never shared.
    response.headers["Cache-Control"] = (
        "private, no-store" if context else "public, max-age=60"
    )
    return {
        "user": await community.me(context) if context else None,
        "home": home,
        "discover": discover,
        "events": events,
        "for_you": personal["for_you"],
        "interests": personal["interests"],
        "cache_ttl": 300,
    }


@router.get("/catalog/events")
async def catalog_events(
    storage: Storage,
    response: Response,
    query: Annotated[str, Query(max_length=120)] = "",
    startup: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
):
    response.headers["Cache-Control"] = "public, max-age=60"
    return await CatalogService(storage).page(
        startup=startup, limit=limit, cursor=cursor, query=query
    )
