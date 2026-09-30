from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Build Dallas API"
    SERVICE_NAME: str = "build-dallas-api"
    API_V1_STR: str = "/v1"
    FASTAPI_ENV: Literal["development", "staging", "production"] = "development"

    CORS_ALLOWED_ORIGINS: str = "http://localhost:8081,http://localhost:3000,http://127.0.0.1:8081,http://127.0.0.1:3000"

    APPWRITE_ENDPOINT: str = "https://nyc.cloud.appwrite.io/v1"
    APPWRITE_PROJECT_ID: str = "6aab47850012ef4d5dd2"
    APPWRITE_DATABASE_ID: str = "6aab47cd0031ba1570e2"
    APPWRITE_API_KEY: SecretStr | None = None
    APPWRITE_PROFILES_TABLE_ID: str = "profiles"
    APPWRITE_EVENTS_TABLE_ID: str = "events"
    APPWRITE_AVATARS_BUCKET_ID: str = "6aab6ee9001c14e2e84c"
    APPWRITE_RESUMES_BUCKET_ID: str = "6aab82cb000f96070a8e"
    APPWRITE_TIMEOUT_SECONDS: float = 15.0


    # Luma integration configuration
    LUMA_API_ORIGIN: str = "https://api.luma.com"
    LUMA_WEB_ORIGIN: str = "https://luma.com"
    LUMA_TIMEOUT_SECONDS: float = 10.0
    LUMA_MAX_RETRIES: int = 3
    LUMA_DEFAULT_CITY: str = "dallas"
    LUMA_CACHE_TTL_PLACE: int = 86400
    LUMA_CACHE_TTL_EVENTS: int = 300
    LUMA_CACHE_TTL_EVENT_DETAIL: int = 900

    # Eventbrite integration configuration
    EVENTBRITE_API_ORIGIN: str = "https://www.eventbrite.com"
    EVENTBRITE_TIMEOUT_SECONDS: float = 12.0
    EVENTBRITE_MAX_RETRIES: int = 3
    EVENTBRITE_DEFAULT_LOCATION: str = "tx--dallas"
    EVENTBRITE_CACHE_TTL_PLACE: int = 86400 * 3
    EVENTBRITE_CACHE_TTL_BOOTSTRAP: int = 3600
    EVENTBRITE_CACHE_TTL_SEARCH: int = 300

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated CORS origins into a list of strings."""
        if not self.CORS_ALLOWED_ORIGINS:
            return []
        return [
            origin.strip()
            for origin in self.CORS_ALLOWED_ORIGINS.split(",")
            if origin.strip()
        ]


settings = Settings()
