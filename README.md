# Build Dallas Supabase V2

Independent Supabase migration of Build Dallas.

- Legacy/reference repo: `anishalle/build-dallas-rn` (read-only for this migration)
- V2 backend: Supabase Auth + Postgres + Storage + pgvector + Edge Functions
- Existing Python Luma/Eventbrite/Meetup collectors are preserved and redirected into Supabase
- Expo / Expo Router / React Native Web remain the product frontend

## Current migration status

- Supabase project created: `build-dallas-v2`
- Core Postgres schema + RLS applied
- Storage buckets created: `avatars`, `resumes`
- pgvector enabled
- Edge Function deployed: `save-interests`
- Edge Function deployed: `embed-provider-events`
- This branch contains the V2 migration overlay and bootstrap docs

## Local setup

1. Copy the legacy source into this independent repo once:

   Windows PowerShell:
   ```powershell
   ./scripts/import-legacy.ps1
   ```

   macOS/Linux:
   ```bash
   ./scripts/import-legacy.sh
   ```

2. Install the Expo dependencies:

   ```bash
   cd rn
   npm install
   ```

3. Copy `rn/.env.example` to `rn/.env` and fill in your Supabase project values.

4. Start:

   ```bash
   npm run web
   ```

See `docs/SETUP_FROM_ZERO.md` and `docs/MIGRATION_STATUS.md`.

## Important

The original repository is not modified by this codebase. Once the one-time legacy import is committed into this repo, V2 is fully independent of the original developer's repository, keys, Appwrite project, Cloudflare account, D1 database, or Vectorize index.
