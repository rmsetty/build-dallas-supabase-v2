"""Collect once, then import the same snapshot into local or remote D1."""

import argparse
import asyncio
import json
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from app.integrations.eventbrite.discover import (
    discover_startups as discover_eventbrite,
)
from app.integrations.eventbrite.service import EventbriteService
from app.integrations.luma.discover import discover_startups as discover_luma
from app.integrations.luma.service import LumaService
from app.integrations.meetup.discover import discover_startups as discover_meetup
from app.integrations.meetup.service import MeetupService
from app.services.event_relevance import DEFAULT_QUERIES


async def collect():
    async def one(source, service, discover, location, general):
        try:
            results = await asyncio.gather(
                discover(service, location, list(DEFAULT_QUERIES)),
                general(service),
                return_exceptions=True,
            )
            records = {}
            incomplete = False
            for index, result in enumerate(results):
                if isinstance(result, Exception):
                    print(
                        f"{source}: collection {index} failed ({type(result).__name__})"
                    )
                    incomplete = True
                    continue
                incomplete |= bool(getattr(result, "incomplete", False))
                for event in result.items:
                    value = event.model_dump(mode="json", by_alias=True)
                    previous = records.get(event.id)
                    records[event.id] = {
                        "event": value,
                        "startup": index == 0 or bool(previous and previous["startup"]),
                    }
            print(f"{source}: {len(records)} events; incomplete={incomplete}")
            return {
                "source": source,
                "fetched_at": datetime.now(UTC).isoformat(),
                "incomplete": incomplete,
                "records": list(records.values()),
            }
        finally:
            await service.aclose()

    return await asyncio.gather(
        one(
            "luma",
            LumaService(),
            discover_luma,
            "dallas",
            lambda s: s.get_events(city="dallas", limit=50),
        ),
        one(
            "eventbrite",
            EventbriteService(),
            discover_eventbrite,
            "tx--dallas",
            lambda s: s.get_events(location="tx--dallas", page_size=50),
        ),
        one(
            "meetup",
            MeetupService(),
            discover_meetup,
            "Dallas, TX",
            lambda s: s.get_events(first=50),
        ),
    )


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def snapshot_sql(snapshot):
    statements = []
    for page in snapshot:
        for record in page["records"]:
            event = record["event"]
            starts = (
                datetime.fromisoformat(event["startAt"].replace("Z", "+00:00"))
                .astimezone(UTC)
                .isoformat()
            )
            values = [
                page["source"],
                event["id"],
                starts,
                int(record["startup"]),
                " ".join(
                    str(event.get(k) or "") for k in ["title", "description", "summary"]
                ).lower(),
                json.dumps(event),
                page["fetched_at"],
            ]
            statements.append(
                "INSERT INTO provider_events "
                "(source,id,starts_at,startup,search_text,data,updated_at) VALUES ("
                + ",".join(map(literal, values))
                + ") ON CONFLICT(source,id) DO UPDATE SET starts_at=excluded.starts_at,"
                "startup=excluded.startup,search_text=excluded.search_text,"
                "data=excluded.data,updated_at=excluded.updated_at,"
                # Re-embed (cron) only when text or start changed; unchanged is free.
                "embedded_at=CASE WHEN provider_events.search_text="
                "excluded.search_text AND provider_events.starts_at="
                "excluded.starts_at THEN provider_events.embedded_at END;"
            )
        statements.append(
            "INSERT INTO ingestion_status (source,fetched_at,incomplete) VALUES ("
            + ",".join(
                map(
                    literal,
                    [page["source"], page["fetched_at"], int(page["incomplete"])],
                )
            )
            + ") ON CONFLICT(source) DO UPDATE SET fetched_at=excluded.fetched_at,"
            "incomplete=excluded.incomplete;"
        )
    return "\n".join(statements)


def apply_sql(sql, remote):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql") as file:
        file.write(sql)
        file.flush()
        subprocess.run(
            [
                "wrangler",
                "d1",
                "execute",
                "build-dallas-events",
                "--remote" if remote else "--local",
                "--file",
                file.name,
                "--yes",
            ],
            check=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    collect_parser = sub.add_parser("collect")
    collect_parser.add_argument("--output", type=Path, required=True)
    import_parser = sub.add_parser("import")
    import_parser.add_argument("--input", type=Path, required=True)
    target = import_parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--local", action="store_true")
    target.add_argument("--remote", action="store_true")
    args = parser.parse_args()
    if args.command == "collect":
        snapshot = asyncio.run(collect())
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(snapshot, indent=2))
    else:
        apply_sql(snapshot_sql(json.loads(args.input.read_text())), args.remote)


if __name__ == "__main__":
    main()
