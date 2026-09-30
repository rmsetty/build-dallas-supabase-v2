"""Offline harness for unchanged provider adapters, no longer exposed by Workers."""

from app.api.routes import eventbrite, luma, meetup
from app.integrations.eventbrite.errors import EventbriteError
from app.integrations.luma.errors import LumaError
from app.integrations.meetup.errors import MeetupError
from app.main import meetup_error, provider_error
from fastapi import FastAPI

app = FastAPI()
app.include_router(luma.router, prefix="/v1/luma")
app.include_router(eventbrite.router, prefix="/v1/eventbrite")
app.include_router(meetup.router, prefix="/v1/meetup")
app.add_exception_handler(LumaError, provider_error)
app.add_exception_handler(EventbriteError, provider_error)
app.add_exception_handler(MeetupError, meetup_error)
