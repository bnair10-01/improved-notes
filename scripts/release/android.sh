#!/usr/bin/env bash
# Build a signed release Android app (one file for phones AND tablets) you can share, plus a Play Store bundle.
#
#   SHARE_APPCHECK_TOKEN=<a token made just for this build> scripts/release/android.sh       # AI works for whoever installs it
#   scripts/release/android.sh --no-ai                                                      # no token inside; AI shows as unavailable
#
# Read RELEASING.md first: the token inside a shared APK can be extracted, so use a dedicated one and revoke it afterwards.
set -euo pipefail
cd "$(dirname "$0")/../.."

NO_AI=0; [ "${1:-}" = "--no-ai" ] && NO_AI=1
KEYSTORE_DIR="${KEYSTORE_DIR:-$HOME/.improved-notes}"
OUT_DIR="${OUT_DIR:-release}"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"

DEV_TOKEN=""; [ -f .env ] && DEV_TOKEN=$(grep -E '^VITE_APPCHECK_DEBUG_TOKEN=' .env | cut -d= -f2- | tr -d '"' || true)
TOKEN=""
if [ "$NO_AI" = 0 ]; then
  TOKEN="${SHARE_APPCHECK_TOKEN:-}"
  if [ -z "$TOKEN" ]; then echo "Set SHARE_APPCHECK_TOKEN to a debug token made just for this build (Firebase console > App Check > Apps > your Android app > Manage debug tokens), or pass --no-ai." >&2; exit 1; fi
  if [ -n "$DEV_TOKEN" ] && [ "$TOKEN" = "$DEV_TOKEN" ]; then
    if [ "${ALLOW_DEV_TOKEN:-0}" != 1 ]; then echo "That is your own development token. Make a separate one for the shared build so you can revoke it without breaking your own testing. (To use it anyway, knowing it becomes extractable, set ALLOW_DEV_TOKEN=1.)" >&2; exit 1; fi
    echo "WARNING: your development token goes inside this APK. Anyone who has the file can read it. Revoke it in the Firebase console when you stop sharing." >&2
  fi
fi

# 1. The release signing key. Made once, then reused for every update. LOSE IT AND INSTALLED COPIES CAN NEVER BE UPDATED, so back it up.
mkdir -p "$KEYSTORE_DIR"
KEYSTORE="$KEYSTORE_DIR/release.keystore"
if [ ! -f "$KEYSTORE" ]; then
  PASS=$(openssl rand -hex 16)
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias improvednotes -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Improved Notes, O=Improved Notes, C=US" >/dev/null 2>&1
  printf 'storePassword=%s\nkeyPassword=%s\nkeyAlias=improvednotes\nstoreFile=%s\n' "$PASS" "$PASS" "$KEYSTORE" > "$KEYSTORE_DIR/keystore.properties"
  chmod 600 "$KEYSTORE" "$KEYSTORE_DIR/keystore.properties"
  echo "Created your release key in $KEYSTORE_DIR. BACK UP that whole folder somewhere safe."
fi
cp "$KEYSTORE_DIR/keystore.properties" android/keystore.properties

# 2. The web app inside the shell, with only the chosen token (or none) baked in.
VITE_APPCHECK_DEBUG_TOKEN="$TOKEN" npm run cap:sync
if [ -n "$DEV_TOKEN" ] && [ "$TOKEN" != "$DEV_TOKEN" ] && grep -rqF "$DEV_TOKEN" android/app/src/main/assets/public 2>/dev/null; then echo "ABORT: your development token is inside the app. Not building." >&2; exit 1; fi

# 3. Build the signed APK (share this) and the Play bundle (upload this to Google Play).
( cd android && ./gradlew clean assembleRelease bundleRelease )
rm -f android/keystore.properties

VER=$(grep -E 'versionName' android/app/build.gradle | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
mkdir -p "$OUT_DIR"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT_DIR/ImprovedNotes-$VER.apk"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT_DIR/ImprovedNotes-$VER.aab"

APKSIGNER=$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/apksigner 2>/dev/null | sort | tail -1 || true)
[ -n "$APKSIGNER" ] && "$APKSIGNER" verify --print-certs "$OUT_DIR/ImprovedNotes-$VER.apk" | head -3
echo; shasum -a 256 "$OUT_DIR/ImprovedNotes-$VER."*
echo
echo "Share: $OUT_DIR/ImprovedNotes-$VER.apk  (works on phones and tablets; people must allow 'install unknown apps')."
echo "Play Store: upload $OUT_DIR/ImprovedNotes-$VER.aab. Bump versionCode in android/app/build.gradle for every update."
[ "$NO_AI" = 1 ] && echo "This build has no token: AI features are unavailable in it." || echo "This build has a token inside. Revoke it in the Firebase console when you are done sharing."
