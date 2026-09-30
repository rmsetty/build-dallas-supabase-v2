"""Thin routes for auth, profile onboarding and persisted events."""

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)

from app.core.request_context import RequestContext, optional_context, require_context
from app.schemas.community import (
    CurrentUser,
    Event,
    EventCreate,
    EventPage,
    Identifier,
    Interests,
    InterestsInput,
    PrivateProfile,
    ProfileInput,
)
from app.services.community import CommunityService
from app.services.for_you import ForYouService
from app.storage.cloudflare import CloudStorage, get_storage

router = APIRouter()


async def get_service(
    storage: Annotated[CloudStorage, Depends(get_storage)],
) -> CommunityService:
    return CommunityService(storage)


async def get_feed(
    storage: Annotated[CloudStorage, Depends(get_storage)],
) -> ForYouService:
    return ForYouService(storage)


Service = Annotated[CommunityService, Depends(get_service)]
Feed = Annotated[ForYouService, Depends(get_feed)]
Context = Annotated[RequestContext, Depends(require_context)]
OptionalContext = Annotated[RequestContext | None, Depends(optional_context)]


@router.get("/users/me", tags=["profile"], response_model=CurrentUser)
async def current_user(context: Context, service: Service):
    return await service.me(context)


@router.put("/users/me/profile", tags=["profile"], response_model=PrivateProfile)
async def save_profile(payload: ProfileInput, context: Context, service: Service):
    """Complete onboarding or replace your profile. No caller-supplied user ID."""
    return await service.save_profile(context, payload)


@router.post("/users/me/avatar", tags=["profile"], response_model=PrivateProfile)
async def upload_avatar(
    context: Context,
    service: Service,
    file: UploadFile = File(...),
):
    """Upload user avatar to Appwrite storage and update profile row."""
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(400, "Only image files are allowed")

    content = await file.read(10 * 1024 * 1024 + 1)
    await file.close()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image file size exceeds 10MB limit")
    if len(content) == 0:
        raise HTTPException(400, "Uploaded file is empty")

    filename = file.filename or "avatar.jpg"
    return await service.upload_avatar(
        context,
        filename=filename,
        content=content,
        mime_type=file.content_type,
    )


@router.delete("/users/me/avatar", tags=["profile"], response_model=PrivateProfile)
async def delete_avatar(context: Context, service: Service):
    """Remove user avatar and clean up bucket storage."""
    return await service.delete_avatar(context)


@router.post("/users/me/resume", tags=["profile"], response_model=PrivateProfile)
async def upload_resume(
    context: Context, service: Service, file: UploadFile = File(...)
):
    """Store a private PDF resume, bounded below the upload limit."""
    try:
        content = await file.read(5_000_001)
    finally:
        await file.close()
    if len(content) > 5_000_000:
        raise HTTPException(413, "Resume must be 5 MB or smaller")
    if not content.startswith(b"%PDF-") or b"%%EOF" not in content[-1024:]:
        raise HTTPException(400, "Upload a valid PDF resume")
    # Do not allow path components or control characters into storage filenames.
    filename = (file.filename or "resume.pdf").replace("\\", "/").split("/")[-1]
    filename = "".join(c for c in filename if c.isprintable()).strip()[:250]
    if not filename.lower().endswith(".pdf"):
        filename = "resume.pdf"
    return await service.upload_resume(context, filename, content)


@router.delete("/users/me/resume", tags=["profile"], response_model=PrivateProfile)
async def delete_resume(context: Context, service: Service):
    return await service.delete_resume(context)


@router.put("/users/me/interests", tags=["profile"], response_model=Interests)
async def save_interests(payload: InterestsInput, context: Context, feed: Feed):
    """Save interest keywords and rank the For You feed against them."""
    return await feed.save_interests(context.user_id, payload.interests, payload.about)


@router.delete("/users/me/interests", tags=["profile"], status_code=204)
async def clear_interests(context: Context, feed: Feed):
    await feed.clear(context.user_id)
    return Response(status_code=204)


@router.post("/events", tags=["events"], response_model=Event, status_code=201)
async def create_event(payload: EventCreate, context: Context, service: Service):
    return await service.create_event(context, payload)


@router.get("/events", tags=["events"], response_model=EventPage)
async def list_events(
    service: Service,
    context: OptionalContext,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Identifier | None = None,
):
    """Public events ordered by start time."""
    return await service.list_events(context, limit, cursor)


@router.get("/events/for-you", tags=["events"])
async def for_you(
    context: Context,
    feed: Feed,
    cursor: Annotated[str | None, Query(pattern=r"^[0-9]{1,3}$")] = None,
):
    """Provider events ranked against your interests; cursor is a rank offset."""
    page = await feed.page(context.user_id, int(cursor or 0))
    if page is None:
        raise HTTPException(404, "Save your interests first")
    return page


@router.get("/events/mine", tags=["events"], response_model=EventPage)
async def my_events(
    service: Service,
    context: Context,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Identifier | None = None,
):
    """Events hosted by the current user, including unlisted/private events."""
    return await service.list_events(context, limit, cursor, mine=True)


@router.get("/events/{event_id}", tags=["events"], response_model=Event)
async def get_event(event_id: Identifier, service: Service, context: OptionalContext):
    return await service.get_event(event_id, context)


@router.get("/avatars/{user_id}/{file_id}", tags=["profile"])
async def avatar(user_id: Identifier, file_id: Identifier, service: Service):
    content, mime = await service.storage.file(f"avatars/{user_id}/{file_id}")
    return Response(
        content,
        media_type=mime,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/users/me/resume", tags=["profile"])
async def resume(context: Context, service: Service):
    profile = await service.profile(context.user_id)
    if not profile.resume_file_id:
        raise HTTPException(404, "Resume not found")
    content, mime = await service.storage.file(
        f"resumes/{context.user_id}/{profile.resume_file_id}"
    )
    return Response(
        content,
        media_type=mime,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": "attachment; filename=resume.pdf",
            "X-Content-Type-Options": "nosniff",
        },
    )
