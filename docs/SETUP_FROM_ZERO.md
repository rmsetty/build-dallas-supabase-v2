# Build Dallas V2 — Setup From Zero

This guide assumes a new computer and no access to the original developer's cloud infrastructure.

## 1. Clone V2
```bash
git clone https://github.com/rmsetty/build-dallas-supabase-v2.git
cd build-dallas-supabase-v2
git checkout migration/supabase
```

## 2. One-time legacy source import
While you still have read access to the original source repo, run:

Windows:
```powershell
./scripts/import-legacy.ps1
```

macOS/Linux:
```bash
chmod +x scripts/import-legacy.sh
./scripts/import-legacy.sh
```

Then commit the imported source into **this** repository. After that, V2 no longer needs the original repository.

## 3. Install local requirements
Install:
- Git
- Node/npm
- Docker Desktop
- Python 3.12+
- Supabase CLI (use `npx supabase` if you do not want a global install)

## 4. Expo
```bash
cd rn
npm install
cp .env.example .env
```

Fill:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## 5. Local Supabase
From repository root:
```bash
npx supabase start
npx supabase db reset
```

All schema changes must live in `supabase/migrations/`.

## 6. Auth
V2 keeps the existing six-digit email-code UX.

Supabase Dashboard → Authentication → Email Templates → Magic Link:
use the `{{ .Token }}` variable so the email contains the OTP code.

## 7. Storage
Buckets:
- `avatars` — public read, owner write
- `resumes` — private, owner only

Never expose a Supabase secret/service-role key to Expo.

## 8. Provider ingestion
The existing Python collectors remain server-side.

Flow:
```
Luma / Eventbrite / Meetup
        ↓
existing collectors
        ↓
normalized JSON
        ↓
Supabase upsert
        ↓
provider_events
        ↓
embed-provider-events Edge Function
        ↓
pgvector
```

GitHub Actions should hold the server-side Supabase secret as a repository secret.

## 9. Recommendations
Saving interests calls `save-interests`.
The function creates a 384-dimension `gte-small` embedding and saves it in `user_interests`.

The app calls `my_recommended_provider_events` to retrieve ranked upcoming events.

## 10. Development independence
Every developer may run their own local Supabase or their own hosted dev project.

Shared:
- Git code
- migrations
- seed data
- Edge Function source
- provider adapters

Not shared:
- developer API keys
- developer databases
- developer test data

## 11. Before production
- Apply all migrations to the production project.
- Configure OTP email template.
- Set GitHub Actions secrets.
- Verify RLS and Storage policies.
- Run Supabase security/performance advisors.
- Test web, iOS, and Android.
- Verify resumes are private.
- Verify private/unlisted community-event locations do not leak.
