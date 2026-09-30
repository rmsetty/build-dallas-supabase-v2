$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $env:TEMP "build-dallas-rn-legacy"

if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }

Write-Host "Cloning legacy Build Dallas source..."
git clone https://github.com/anishalle/build-dallas-rn.git $temp

Write-Host "Copying frontend and backend source into independent V2 repo..."
robocopy (Join-Path $temp "rn") (Join-Path $repoRoot "rn") /E /XD node_modules .expo /XF .env | Out-Null
robocopy (Join-Path $temp "backend") (Join-Path $repoRoot "backend") /E /XD .venv __pycache__ /XF .env | Out-Null

Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $repoRoot "rn/src/features/auth/appwrite-client.ts")\nRemove-Item -Force -ErrorAction SilentlyContinue (Join-Path $repoRoot "rn/src/features/auth/appwrite-client.web.ts")\n\nWrite-Host "Restoring V2-owned overlay files..."
git -C $repoRoot checkout migration/supabase -- README.md scripts docs supabase rn/package.json rn/.env.example rn/src/lib/supabase.ts rn/src/features/auth/appwrite-auth.ts rn/src/features/events/community-api.ts rn/src/features/discover/bootstrap-api.ts rn/src/features/interests/interests-api.ts rn/src/features/events/luma-api.ts rn/src/features/events/eventbrite-api.ts rn/src/features/events/meetup-api.ts

Remove-Item -Recurse -Force $temp
Write-Host "Legacy source imported. Review 'git status', then commit the imported files into this V2 repository."
