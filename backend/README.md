# Build Dallas API

FastAPI on Python Workers, managed with uv and Pywrangler. No Flask, Uvicorn,
PostgreSQL, or R2 is needed.

## Ownership

| System | Data / responsibility |
| --- | --- |
| Appwrite client SDK | Email OTP, session creation/logout, short-lived API JWTs |
| Appwrite TablesDB | Profiles, including private resume metadata |
| Appwrite buckets | Avatars and private PDF resumes |
| D1 | Community events and normalized provider event snapshots |
| Workers | API authorization, event queries, bootstrap composition and edge caches |

OTP and logout proxy endpoints have been removed. The API accepts an Appwrite JWT,
verifies it using Appwrite's account endpoint, and requires an active, verified email
account. It never trusts a supplied user ID or an unverified JWT payload.

## Run locally

```sh
uv sync
cp .env.example .env
# Fill APPWRITE_API_KEY for profiles and uploads. No client secret belongs in rn/.
uv run pywrangler d1 migrations apply build-dallas-events --local
uv run pywrangler dev
```

Wrangler listens on port 8000. Local D1 is isolated from remote D1. **Appwrite auth,
profiles and buckets remain real hosted services in local mode.** Use a separate
Appwrite project/key in `.env` if full data isolation is needed. The schema helper
`uv run python -m app.scripts.setup_appwrite` now manages profiles only.

## One-time provider snapshot

The Luma, Eventbrite and Meetup collectors retain their existing discovery,
normalization and relevance logic. They are not called by the Worker. Collection is
bounded, not a guaranteed exhaustive archive; partial results remain marked incomplete.

```sh
uv run python -m app.scripts.seed_events collect --output migration-export/events.json
uv run python -m app.scripts.seed_events import --input migration-export/events.json --local
# Import that exact snapshot remotely without making more provider requests:
uv run python -m app.scripts.seed_events import --input migration-export/events.json --remote
```

Re-imports upsert provider IDs without duplicating them. They do not delete historical
records. Snapshot files are gitignored. No cron or Appwrite Functions were deployed;
a future function can reuse these collectors and write the same D1 schema. History
stays in D1; app feeds query upcoming events with indexed keyset pagination.

## Existing community events

Profiles and files stay where they are. To migrate only legacy Appwrite events:

```sh
uv run python -m app.scripts.migrate_events --export migration-export/community-events.json
uv run python -m app.scripts.migrate_events --input migration-export/community-events.json --local
uv run python -m app.scripts.migrate_events --input migration-export/community-events.json --remote
```

The source is read-only. Existing D1 IDs are not overwritten. Stop writes through the
old backend during final cutover, export again, then switch clients. Source tables
are not deleted, so a rollback remains possible; events created in D1 after cutover
would need copying back before reverting to the old API.

## Deploy

The repository's Wrangler file binds `DB` to `build-dallas-events`. It contains public
IDs/configuration only. On a different account create a D1 database and update its ID.

```sh
# One-time: the For You index (create the metadata index before any vectors exist).
npx wrangler vectorize create build-dallas-events --dimensions=384 --metric=cosine
npx wrangler vectorize create-metadata-index build-dallas-events --property-name=starts_at --type=number
uv run pywrangler d1 migrations apply build-dallas-events --remote
uv run pywrangler secret put APPWRITE_API_KEY
uv run pywrangler deploy
```

Apply migrations before the next `seed_events import`: the import writes `embedded_at`.

Use an Appwrite key with profile row read/write and file read/write plus bucket read
access (for private-resume validation). Auth/session administration scopes are not
needed. Register web/native clients in Appwrite; set Worker `CORS_ALLOWED_ORIGINS`
for permitted web origins. Set the returned URL in `rn/.env` as `EXPO_PUBLIC_API_URL`.

## Requests and caching

`GET /v1/bootstrap` returns `user`, `home`, `discover`, `events`, `for_you`,
`interests`, and `cache_ttl`.
Home and Discover reuse one in-memory, deduplicated request for five minutes; each
page contains up to 100 provider events and a continuation cursor. Profile mutations
update local bootstrap state. Logout clears it. Catalog pages/details use D1 and
never trigger live provider fetches.

| Cached content | TTL | Boundary |
| --- | --- | --- |
| Provider catalog pages and details | 300 seconds | Shared public data |
| Public community feed | 60 seconds | Redacted host addresses, no resume fields |
| Profiles | 60 seconds | Internal per-user key, never a public response cache |
| Verified Appwrite identity | At most 60 seconds and never past JWT expiry | Token digest + project; no raw JWT in cache keys |
| For You first page + interests | 300 seconds | Internal per-user key; cleared on interest save/clear |
| Mobile bootstrap | 300 seconds | In-memory per session; cleared on logout |

TTLs for profiles, provider events and identity are configured in `wrangler.jsonc`.
The Worker explicitly uses Cloudflare's Cache API: a Wrangler flag alone does not
cache SQL queries. Cache misses execute indexed, bounded D1 queries. Cache API data
is local to a Cloudflare location; eviction and cold locations still cause reads.
This is not a globally coordinated cache or a guarantee of zero D1 reads.

Authenticated bootstrap responses are `private, no-store`. Only public components
are shared internally. Personal event views are not shared. Profile writes return
fresh data and update the local edge cache; other locations may be stale for up to
60 seconds. Session revocation/account changes may take up to 60 seconds to propagate
through the identity cache. Uploaded avatars use Appwrite URLs directly; resumes
remain private and are served only through an authenticated owner endpoint.

## For You feed

Home ranks upcoming provider events against the user's interests, sized to stay inside
the Workers Paid included usage:

- The app parses resumes on-device and sends only keywords
  (`PUT /v1/users/me/interests`, at most 30); no resume text reaches the API.
- An hourly cron embeds new upcoming events once with `EMBED_MODEL`
  (bge-small, 384 dims), upserts them to Vectorize, and deletes vectors a day after
  events start. Re-imports only reset `embedded_at` when text or start time changed.
- A user's ranking (top 100 IDs) is one Vectorize query, stored in D1 `user_feeds`. It
  reruns only on an interest save, or when the catalog changed and the ranking is
  older than `FEED_REFRESH_HOURS`. Feed reads never query Vectorize.
- `GET /v1/events/for-you?cursor=<offset>` pages the stored ranking; bootstrap carries
  page one, so app opens make no extra request. Saves are capped at one per 30
  seconds and 20 per day.

Trigger the cron locally with `curl "http://localhost:8000/cdn-cgi/local/scheduled"`.
AI and Vectorize bindings need `uv run pywrangler dev --remote`.

## Checks

```sh
uv run ruff check src tests
uv run pytest -q
curl http://localhost:8000/healthz
curl http://localhost:8000/v1/bootstrap
# In rn/: npm run typecheck
```

Tests execute the D1 migration and queries in SQLite and cover privacy, cache hits,
JWT validation/cache expiry, uploads, cursors and idempotent imports. Existing provider
route tests run in a dedicated offline harness, not in the deployed Worker.

References: [Python Workers/FastAPI](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/),
[Cloudflare examples](https://github.com/cloudflare/python-workers-examples),
[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/),
[Appwrite React Native](https://appwrite.io/docs/quick-starts/react-native).
