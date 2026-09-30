"""Pydantic schemas for API request validation and response serialization."""

from datetime import datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class HealthResponse(BaseModel):
    """Health check response matching the client contract."""

    status: Literal["ok"] = "ok"
    service: str = "build-dallas-api"


# --- Example Resource Schemas ---


class ItemBase(BaseModel):
    """Shared properties for Item schemas."""

    title: str = Field(..., min_length=1, max_length=255, description="Item title")
    description: str | None = Field(
        default=None, max_length=1000, description="Item description"
    )
    is_active: bool = Field(default=True, description="Whether the item is active")


class ItemCreate(ItemBase):
    """Payload for creating a new Item."""

    pass


class ItemUpdate(BaseModel):
    """Payload for updating an existing Item."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class ItemResponse(ItemBase):
    """Schema returned when reading an Item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic envelope for paginated collections."""

    items: list[T]
    total: int
    skip: int
    limit: int
