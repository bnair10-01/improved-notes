#!/usr/bin/env bash
# Build for production with the App Check debug token blanked, refuse to deploy if the token
# leaked into the bundle, then deploy to Firebase Hosting.
set -euo pipefail
PROJECT="${FIREBASE_PROJECT:-improvednotes-d0907}"

TOKEN=""
if [ -f .env ]; then TOKEN=$(grep -E '^VITE_APPCHECK_DEBUG_TOKEN=' .env | cut -d= -f2- | tr -d '"' || true); fi

VITE_APPCHECK_DEBUG_TOKEN="" npm run build

if [ -n "$TOKEN" ] && grep -rqF "$TOKEN" dist; then
  echo "ABORT: the App Check debug token is inside dist/. Not deploying." >&2
  exit 1
fi
echo "Bundle is clean of the debug token."

npx firebase deploy --only hosting --project "$PROJECT"
