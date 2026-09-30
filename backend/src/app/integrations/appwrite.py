"""Request-scoped Appwrite REST transport; never mixes admin and user credentials."""

import json
from collections.abc import Generator
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.core.config import Settings, settings


class AppwriteError(Exception):
    def __init__(self, status: int, kind: str):
        self.status = status
        self.kind = kind
        super().__init__(f"Appwrite error {status}: {kind}")


def query(method: str, attribute: str | None = None, values=None) -> str:
    result: dict[str, Any] = {"method": method}
    if attribute is not None:
        result["attribute"] = attribute
        result["column"] = attribute
    if values is not None:
        result["values"] = values
    return json.dumps(result, separators=(",", ":"))


def segment(value: str) -> str:
    return quote(value, safe="")


class Appwrite:
    def __init__(self, http: httpx.Client, config: Settings):
        self.http = http
        self.config = config

    def request(
        self,
        method: str,
        path: str,
        *,
        data=None,
        files=None,
        queries=None,
        admin: bool = True,
        session: str | None = None,
    ) -> dict:
        headers = {"X-Appwrite-Project": self.config.APPWRITE_PROJECT_ID}
        if session is not None:
            headers["X-Appwrite-Session"] = session
        elif admin:
            key = self.config.APPWRITE_API_KEY
            if key is None:
                raise HTTPException(503, "APPWRITE_API_KEY is not configured")
            headers["X-Appwrite-Key"] = key.get_secret_value()
        try:
            kwargs: dict[str, Any] = {"headers": headers}
            if queries:
                kwargs["params"] = [("queries[]", q) for q in queries]
            if files is not None:
                kwargs["data"] = data
                kwargs["files"] = files
            elif data is not None:
                kwargs["json"] = data

            response = self.http.request(
                method,
                self.config.APPWRITE_ENDPOINT.rstrip("/") + path,
                **kwargs,
            )
        except httpx.RequestError as exc:
            raise HTTPException(503, "Appwrite is temporarily unavailable") from exc
        if response.is_error:
            try:
                kind = response.json().get("type", "unknown")
            except ValueError:
                kind = "unknown"
            # Never expose upstream messages, secrets, or response bodies.
            raise AppwriteError(response.status_code, kind)
        return response.json() if response.content else {}

    def rows_path(self, table: str) -> str:
        return (
            f"/tablesdb/{segment(self.config.APPWRITE_DATABASE_ID)}"
            f"/tables/{segment(table)}/rows"
        )

    def row(self, table: str, row_id: str) -> dict | None:
        try:
            return self.request("GET", f"{self.rows_path(table)}/{segment(row_id)}")
        except AppwriteError as exc:
            if exc.kind == "row_not_found":
                return None
            raise

    def upload_file(
        self,
        bucket_id: str,
        filename: str,
        content: bytes,
        mime_type: str = "image/jpeg",
    ) -> dict:
        return self.request(
            "POST",
            f"/storage/buckets/{segment(bucket_id)}/files",
            data={"fileId": "unique()"},
            files={"file": (filename, content, mime_type)},
        )

    def delete_file(self, bucket_id: str, file_id: str) -> None:
        try:
            self.request(
                "DELETE",
                f"/storage/buckets/{segment(bucket_id)}/files/{segment(file_id)}",
            )
        except AppwriteError as exc:
            if exc.status == 404 or exc.kind in ("file_not_found", "general_not_found"):
                return
            raise


def get_appwrite() -> Generator[Appwrite, None, None]:
    # A separate client per request prevents cookie/session leakage between users.
    with httpx.Client(timeout=settings.APPWRITE_TIMEOUT_SECONDS) as http:
        yield Appwrite(http, settings)
