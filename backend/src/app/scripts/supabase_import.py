"""Import a collected provider snapshot into Supabase Postgres.

Usage:
  uv run python -m app.scripts.seed_events collect --output /tmp/events.json
  uv run python -m app.scripts.supabase_import --input /tmp/events.json

Required env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import httpx


def clean(value):
    return " ".join(str(value or "").split())


def headers():
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def event_row(page, record):
    event = record["event"]
    starts = (
        datetime.fromisoformat(event["startAt"].replace("Z", "+00:00"))
        .astimezone(UTC)
        .isoformat()
    )
    ends_raw = event.get("endAt")
    ends = (
        datetime.fromisoformat(ends_raw.replace("Z", "+00:00")).astimezone(UTC).isoformat()
        if ends_raw
        else None
    )
    search_text = clean(
        " ".join(
            str(event.get(key) or "")
            for key in ("title", "description", "summary")
        )
    ).lower()
    return {
        "source": page["source"],
        "provider_event_id": str(event["id"]),
        "starts_at": starts,
        "ends_at": ends,
        "title": clean(event.get("title")),
        "startup": bool(record["startup"]),
        "search_text": search_text,
        "data": event,
        "fetched_at": page["fetched_at"],
        # Re-embedding on each provider refresh is intentionally simple for V2.
        "embedding": None,
        "embedded_at": None,
    }


def import_snapshot(snapshot):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    with httpx.Client(timeout=60.0, headers=headers()) as client:
        for page in snapshot:
            rows = [event_row(page, record) for record in page["records"]]
            if rows:
                response = client.post(
                    f"{base}/rest/v1/provider_events?on_conflict=source,provider_event_id",
                    json=rows,
                )
                response.raise_for_status()

            status = {
                "source": page["source"],
                "fetched_at": page["fetched_at"],
                "incomplete": bool(page["incomplete"]),
                "item_count": len(rows),
                "error": None,
                "updated_at": datetime.now(UTC).isoformat(),
            }
            response = client.post(
                f"{base}/rest/v1/ingestion_status?on_conflict=source",
                json=[status],
            )
            response.raise_for_status()
            print(f"{page['source']}: imported {len(rows)} records")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    import_snapshot(json.loads(args.input.read_text()))


if __name__ == "__main__":
    main()
