"""Copy legacy Appwrite events to D1; profiles/files stay in Appwrite.

Source rows are never changed. Existing D1 event IDs are never overwritten.
"""

import argparse
import json
from datetime import UTC
from pathlib import Path

import httpx

from app.core.config import settings
from app.integrations.appwrite import Appwrite, query
from app.schemas.community import EventCreate
from app.scripts.seed_events import apply_sql, literal


def export_events():
    records = []
    with httpx.Client(timeout=30) as http:
        api = Appwrite(http, settings)
        cursor = None
        while True:
            filters = [query("limit", values=[100]), query("orderAsc", "$id")]
            if cursor:
                filters.append(query("cursorAfter", values=[cursor]))
            rows = api.request(
                "GET", api.rows_path(settings.APPWRITE_EVENTS_TABLE_ID), queries=filters
            )["rows"]
            for row in rows:
                data = {k: v for k, v in row.items() if not k.startswith("$")}
                location = data.pop("location_json", None)
                data["location"] = json.loads(location) if location else None
                host = data.pop("host_id")
                # Validate against the same event contract before touching D1.
                payload = EventCreate.model_validate(data)
                data = payload.model_dump(mode="json")
                data.update(
                    id=row["$id"],
                    host_id=host,
                    created_at=row["$createdAt"],
                    updated_at=row["$updatedAt"],
                )
                data["starts_at"] = payload.starts_at.astimezone(UTC).isoformat()
                data["ends_at"] = payload.ends_at.astimezone(UTC).isoformat()
                records.append(data)
            if len(rows) < 100:
                break
            cursor = rows[-1]["$id"]
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", type=Path)
    parser.add_argument("--input", type=Path)
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--local", action="store_true")
    target.add_argument("--remote", action="store_true")
    args = parser.parse_args()
    if args.export:
        records = export_events()
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_text(json.dumps(records, indent=2))
        args.export.chmod(0o600)
        print(f"Exported {len(records)} community events; source unchanged")
    elif args.input and (args.local or args.remote):
        statements = []
        for event in json.loads(args.input.read_text()):
            values = [
                event["id"],
                event["host_id"],
                event["visibility"],
                event["starts_at"],
                json.dumps(event),
            ]
            statements.append(
                "INSERT INTO events (id,host_id,visibility,starts_at,data) VALUES ("
                + ",".join(map(literal, values))
                + ") ON CONFLICT(id) DO NOTHING;"
            )
        if statements:
            apply_sql("\n".join(statements), args.remote)
        print(f"Imported {len(statements)} event records without overwriting D1 IDs")
    else:
        parser.error("Use --export PATH, or --input PATH with --local/--remote")


if __name__ == "__main__":
    main()
