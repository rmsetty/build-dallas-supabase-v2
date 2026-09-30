#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Cloning legacy Build Dallas source..."
git clone https://github.com/anishalle/build-dallas-rn.git "$TMP/legacy"

echo "Copying frontend and backend source into independent V2 repo..."
mkdir -p "$ROOT/rn" "$ROOT/backend"
rsync -a --exclude node_modules --exclude .expo --exclude .env "$TMP/legacy/rn/" "$ROOT/rn/"
rsync -a --exclude .venv --exclude __pycache__ --exclude .env "$TMP/legacy/backend/" "$ROOT/backend/"

rm -f "$ROOT/rn/src/features/auth/appwrite-client.ts" "$ROOT/rn/src/features/auth/appwrite-client.web.ts"\n\necho "Restoring V2-owned overlay files..."
git -C "$ROOT" checkout migration/supabase -- README.md scripts docs supabase rn/package.json rn/.env.example rn/src/lib/supabase.ts rn/src/features/auth/appwrite-auth.ts rn/src/features/events/community-api.ts rn/src/features/discover/bootstrap-api.ts rn/src/features/interests/interests-api.ts rn/src/features/events/luma-api.ts rn/src/features/events/eventbrite-api.ts rn/src/features/events/meetup-api.ts

echo "Legacy source imported. Review 'git status', then commit the imported files into this V2 repository."
