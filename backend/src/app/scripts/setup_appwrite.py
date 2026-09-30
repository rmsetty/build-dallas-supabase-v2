"""Create missing TablesDB schema, validate existing schema, and wait for readiness.

Run explicitly with `uv run python -m app.scripts.setup_appwrite`. No seeds/deletes.
"""

import time

import httpx

from app.core.config import settings
from app.integrations.appwrite import Appwrite, AppwriteError, segment

# (type, key, required, additional Appwrite parameters)
PROFILE_COLUMNS = [
    ("varchar", "name", True, {"size": 128}),
    ("text", "bio", False, {}),
    ("varchar", "avatar_url", False, {"size": 2048}),
    ("varchar", "linkedin_url", False, {"size": 2048}),
    ("varchar", "resume_file_id", False, {"size": 36}),
    ("varchar", "resume_filename", False, {"size": 255}),
    ("integer", "resume_size", False, {"min": 0, "max": 5000000}),
    ("datetime", "resume_uploaded_at", False, {}),
]


def existing(api: Appwrite, path: str, missing: str):
    try:
        return api.request("GET", path)
    except AppwriteError as exc:
        if exc.status == 404 and exc.kind == missing:
            return None
        raise


def wait_ready(api: Appwrite, path: str, timeout: float = 120) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = api.request("GET", path)
        if value["status"] == "available":
            return value
        if value["status"] in {"failed", "stuck"}:
            raise RuntimeError(f"Schema build failed: {path}")
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {path}. Re-run setup to resume.")


def validate_column(column: dict, kind: str, payload: dict):
    # Appwrite TablesDB exposes varchar and text.
    if column["type"] != kind:
        if not (
            kind in {"varchar", "string"} and column["type"] in {"varchar", "string"}
        ):
            raise RuntimeError(f"Column type mismatch: {payload['key']}")
    for key, value in payload.items():
        if key in ("min", "max"):
            continue
        if key == "size" and column.get("type") == "text":
            continue
        if key in column and column.get(key) != value:
            raise RuntimeError(f"Column configuration mismatch: {payload['key']}.{key}")


def setup(api: Appwrite):
    database_path = f"/tablesdb/{segment(api.config.APPWRITE_DATABASE_ID)}"
    database = api.request("GET", database_path)
    if database["name"] != "main":
        raise RuntimeError("Expected the configured database to be named 'main'")
    tables = [
        (api.config.APPWRITE_PROFILES_TABLE_ID, PROFILE_COLUMNS, []),
    ]
    for table_id, columns, indexes in tables:
        path = f"{database_path}/tables/{segment(table_id)}"
        table = existing(api, path, "table_not_found")
        if table is None:
            api.request(
                "POST",
                f"{database_path}/tables",
                data={
                    "tableId": table_id,
                    "name": table_id,
                    "permissions": [],
                    "rowSecurity": False,
                    "enabled": True,
                },
            )
        elif table.get("$permissions") or table.get("rowSecurity"):
            raise RuntimeError(
                f"{table_id} must have empty permissions and row security disabled. "
                "FastAPI enforces access; direct client access would leak private data."
            )
        for kind, key, required, extra in columns:
            column_path = f"{path}/columns/{key}"
            payload = {"key": key, "required": required, **extra}
            if existing(api, column_path, "column_not_found") is None:
                api.request("POST", f"{path}/columns/{kind}", data=payload)
            column = wait_ready(api, column_path)
            validate_column(column, kind, payload)
        for key, fields in indexes:
            index_path = f"{path}/indexes/{key}"
            if existing(api, index_path, "index_not_found") is None:
                api.request(
                    "POST",
                    f"{path}/indexes",
                    data={
                        "key": key,
                        "type": "key",
                        "columns": fields,
                        "orders": ["ASC"] * len(fields),
                    },
                )
            index = wait_ready(api, index_path)
            if (
                index["columns"] != fields
                or index["type"] != "key"
                or index["orders"] != ["ASC"] * len(fields)
            ):
                raise RuntimeError(f"Index configuration mismatch: {key}")
        print(f"Ready: {table_id}")


def main():
    if settings.APPWRITE_API_KEY is None:
        raise SystemExit("Set APPWRITE_API_KEY in backend/.env before running setup")
    try:
        with httpx.Client(timeout=settings.APPWRITE_TIMEOUT_SECONDS) as http:
            setup(Appwrite(http, settings))
    except (AppwriteError, RuntimeError) as exc:
        raise SystemExit(str(exc)) from exc
    print("Appwrite schema is ready. No mock events were inserted.")


if __name__ == "__main__":
    main()
