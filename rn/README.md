# Build Dallas mobile

Expo SDK 57, React Native 0.86, TypeScript and Expo Router.

Routes live in `src/app/`; feature code lives in `src/features/`.
`src/features/auth/` manages Appwrite client sessions and short-lived API JWTs.
`src/features/discover/bootstrap-api.ts` shares the startup payload between auth,
Home and Discover, with a five-minute session-scoped cache.

Copy `.env.example` to `.env`. `EXPO_PUBLIC_USE_LOCAL_API=true` uses local Wrangler
in development; set `EXPO_PUBLIC_LOCAL_API_URL` for a physical device. With the
flag off (and in release builds), `EXPO_PUBLIC_API_URL` selects the published Worker.
Appwrite auth, profiles and buckets remain hosted even with a local API.

Register the web host and native package/bundle ID in Appwrite and set
`EXPO_PUBLIC_APPWRITE_PLATFORM` for native builds. Never put a server API key in
Expo variables. Backend-issued legacy sessions require one new sign-in.

```sh
npm ci
npm start
npm run typecheck
npx expo export --platform web
```

See the [root README](../README.md) and [API README](../backend/README.md) for
backend setup, event snapshots and deployment.
