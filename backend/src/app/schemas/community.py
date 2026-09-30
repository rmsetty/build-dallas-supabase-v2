"""API contracts for email authentication, onboarding, and event creation."""

import re
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    model_validator,
)

Identifier = Annotated[
    str, StringConstraints(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$")
]
ImageURL = Annotated[HttpUrl, Field(max_length=2048)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EmailOTPRequest(Input):
    email: EmailStr = Field(max_length=320)


class EmailOTPVerify(Input):
    user_id: Identifier
    code: str = Field(pattern=r"^[0-9]{6}$")


class OTPChallenge(BaseModel):
    user_id: str
    expires_at: datetime


class ProfileInput(Input):
    name: str = Field(min_length=1, max_length=128)
    bio: str = Field(default="", max_length=2000)
    avatar_url: ImageURL | None = None
    linkedin_url: ImageURL | None = None

    @field_validator("linkedin_url")
    @classmethod
    def linkedin_profile(cls, value):
        if value is None:
            return None
        parts = urlsplit(str(value))
        if (
            parts.scheme != "https"
            or parts.hostname not in {"linkedin.com", "www.linkedin.com"}
            or parts.username
            or parts.password
            or parts.port
            or not re.fullmatch(r"/in/[^/]+/?", parts.path)
        ):
            raise ValueError(
                "Use a LinkedIn profile URL: https://www.linkedin.com/in/your-name"
            )
        return value


class Profile(BaseModel):
    id: str
    name: str = ""
    bio: str = ""
    avatar_url: ImageURL | None = None
    onboarding_complete: bool = False
    linkedin_url: ImageURL | None = None


class PrivateProfile(Profile):
    resume_file_id: str | None = None
    resume_filename: str | None = None
    resume_size: int | None = None
    resume_uploaded_at: datetime | None = None


class InterestsInput(Input):
    """Keywords the app extracted on-device (or the user picked); never raw resumes."""

    interests: list[Annotated[str, StringConstraints(min_length=1, max_length=40)]] = (
        Field(default_factory=list, max_length=30)
    )
    about: str = Field(default="", max_length=280)


class Interests(BaseModel):
    interests: list[str]
    about: str
    updated_at: datetime


class CurrentUser(BaseModel):
    id: str
    email: EmailStr
    profile: PrivateProfile


class AuthSession(BaseModel):
    token_type: Literal["Bearer"] = "Bearer"
    access_token: str
    expires_at: datetime
    user: CurrentUser


class Location(Input):
    label: str = Field(min_length=1, max_length=255)
    # Only this coarse area is returned to non-hosts when the address is hidden.
    area: str = Field(min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    instructions: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def coordinates_together(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        return self


class EventCreate(Input):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=20000)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    timezone: str = Field(default="America/Chicago", max_length=64)
    location: Location | None = None
    image_url: ImageURL | None = None
    hide_exact_location: bool = False
    require_approval: bool = False
    visibility: Literal["public", "unlisted", "private"] = "public"
    capacity: int | None = Field(default=None, ge=1, le=1000000, strict=True)
    # Paid tickets need a payment flow; accept only free events in this phase.
    price_cents: Literal[0] = 0
    currency: Literal["USD"] = "USD"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Use an IANA timezone, e.g. America/Chicago") from exc
        return value

    @model_validator(mode="after")
    def end_after_start(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class Event(EventCreate):
    id: str
    host: Profile
    created_at: datetime
    updated_at: datetime
    image_background: Literal["#000000"] = "#000000"


class EventPage(BaseModel):
    items: list[Event]
    next_cursor: str | None = None
