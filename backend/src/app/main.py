"""FastAPI on Python Workers. No server process, SQLAlchemy, or auth proxy."""

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.main import api_router
from app.core.config import settings
from app.integrations.eventbrite import EventbriteError, EventbriteRateLimitError
from app.integrations.luma import LumaError, LumaRateLimitError
from app.integrations.meetup.errors import MeetupError

app = FastAPI(title=settings.PROJECT_NAME, openapi_url="/v1/openapi.json")


class RuntimeCORS:
    """Bindings are request-scoped; do not mutate global settings per request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        env = scope.get("env")
        configured = getattr(env, "CORS_ALLOWED_ORIGINS", None) if env else None
        origins = (
            [item.strip() for item in configured.split(",") if item.strip()]
            if configured
            else settings.cors_origins
        )
        cors = CORSMiddleware(
            self.app,
            allow_origins=origins,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
            expose_headers=["Cache-Control"],
            max_age=86400,
        )
        await cors(scope, receive, send)


app.add_middleware(RuntimeCORS)


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok", "service": settings.SERVICE_NAME}


app.include_router(api_router, prefix="/v1")


@app.middleware("http")
async def cache_control(request, call_next):
    response = await call_next(request)
    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(LumaError)
@app.exception_handler(EventbriteError)
async def provider_error(request, exc):
    headers = {}
    if (
        isinstance(exc, (LumaRateLimitError, EventbriteRateLimitError))
        and exc.retry_after is not None
    ):
        headers["Retry-After"] = str(int(exc.retry_after))
    return JSONResponse(
        {"detail": exc.message}, status_code=exc.status_code, headers=headers
    )


@app.exception_handler(MeetupError)
async def meetup_error(request, exc):
    return JSONResponse(
        {
            "detail": str(exc)
            if exc.status == 404
            else "Meetup discovery is temporarily unavailable"
        },
        status_code=exc.status if exc.status in (404, 503) else 502,
    )
