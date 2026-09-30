"""Existing provider detail URLs now read normalized records from D1."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Response

from app.services.catalog import CatalogService
from app.storage.cloudflare import CloudStorage, get_storage

router = APIRouter(tags=["events"])


@router.get("/{source}/events/{event_id}")
async def detail(
    source: Literal["luma", "eventbrite", "meetup"],
    event_id: Annotated[str, Path(pattern=r"^[a-zA-Z0-9_-]{1,100}$")],
    storage: Annotated[CloudStorage, Depends(get_storage)],
    response: Response,
):
    record = await CatalogService(storage).detail(source, event_id)
    if record is None:
        raise HTTPException(404, "Event not in the imported catalog")
    response.headers["Cache-Control"] = "public, max-age=300"
    return record
