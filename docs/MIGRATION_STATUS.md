# Migration Status

## Preserved from the legacy implementation
- Expo / Expo Router / React Native Web product UI
- Local PDF resume parsing
- Luma collector
- Eventbrite collector
- Meetup collector
- Normalized provider-event JSON shapes
- Community event UX
- For You / interests UX

## Replaced in V2
| Legacy | V2 |
| --- | --- |
| Appwrite Auth | Supabase Auth |
| Appwrite TablesDB | Supabase Postgres |
| Appwrite Storage | Supabase Storage |
| Cloudflare D1 | Supabase Postgres |
| Workers AI embeddings | Supabase Edge Function `gte-small` |
| Vectorize | pgvector |
| Cloudflare Worker CRUD API | Direct Supabase + RLS/RPC |
| Cloudflare Cron | Supabase Cron / GitHub Actions |

## Supabase project
Project name: `build-dallas-v2`

Core schema, RLS, Storage buckets, pgvector and the first Edge Functions have already been created in the hosted V2 project.

## Remaining parity work
- Import the legacy frontend/backend files into this independent repository once.
- Run the V2 frontend overlay against the imported UI.
- Replace the D1 importer with the Supabase ingestion adapter.
- Add scheduled GitHub Actions for provider refresh.
- Run full web/native regression testing.
- Remove unused Appwrite/Cloudflare runtime files only after parity is confirmed.
