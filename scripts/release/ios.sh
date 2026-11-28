#!/usr/bin/env bash
# Build the iPhone + iPad app (one universal app) as a full Release build.
#
#   scripts/release/ios.sh device <UDID> [<UDID> ...]   install a Release build on your own connected iPhone/iPad (free Apple ID is fine; it expires after 7 days)
#   scripts/release/ios.sh ipa adhoc                    a shareable .ipa for devices you've registered (needs the paid Apple Developer Program)
#   scripts/release/ios.sh ipa appstore                 an .ipa for TestFlight / the App Store (paid program)
#
# Environment: TEAM_ID (default WY6V5GC2M4, your current personal team; for the paid program use that team's ID),
#              SHARE_APPCHECK_TOKEN (a token made just for this build) or pass --no-ai as the last argument.
# Read RELEASING.md first. iOS can't be shared by just sending a file the way Android can; Apple decides who may install.
set -euo pipefail
cd "$(dirname "$0")/../.."

MODE="${1:-}"; shift || true
NO_AI=0; ARGS=(); for a in "$@"; do [ "$a" = "--no-ai" ] && NO_AI=1 || ARGS+=("$a"); done
TEAM_ID="${TEAM_ID:-WY6V5GC2M4}"
OUT_DIR="${OUT_DIR:-release}"

DEV_TOKEN=""; [ -f .env ] && DEV_TOKEN=$(grep -E '^VITE_APPCHECK_DEBUG_TOKEN=' .env | cut -d= -f2- | tr -d '"' || true)
TOKEN=""
if [ "$NO_AI" = 0 ]; then
  TOKEN="${SHARE_APPCHECK_TOKEN:-}"
  [ -z "$TOKEN" ] && { echo "Set SHARE_APPCHECK_TOKEN (a debug token made just for this build, Firebase console > App Check > your iOS app) or add --no-ai." >&2; exit 1; }
  [ -n "$DEV_TOKEN" ] && [ "$TOKEN" = "$DEV_TOKEN" ] && { echo "That's your own development token. Make a separate one for the shared build." >&2; exit 1; }
fi

VITE_APPCHECK_DEBUG_TOKEN="$TOKEN" npm run cap:sync
if [ -n "$DEV_TOKEN" ] && grep -rqF "$DEV_TOKEN" ios/App/App/public 2>/dev/null; then echo "ABORT: your development token is inside the app. Not building." >&2; exit 1; fi

case "$MODE" in
  device)
    [ ${#ARGS[@]} -gt 0 ] || { echo "Give at least one device UDID (xcrun devicectl list devices)." >&2; exit 1; }
    for UDID in "${ARGS[@]}"; do
      DD="$(mktemp -d)"
      xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination "id=$UDID" -derivedDataPath "$DD" \
        DEVELOPMENT_TEAM="$TEAM_ID" -allowProvisioningUpdates build
      xcrun devicectl device install app --device "$UDID" "$DD/Build/Products/Release-iphoneos/App.app"
      echo "Installed on $UDID. With a free Apple ID it stops opening after 7 days; run this again to renew."
    done ;;
  ipa)
    METHOD="${ARGS[0]:-}"; case "$METHOD" in adhoc) EXPORT=release-testing ;; appstore) EXPORT=app-store-connect ;; *) echo "Use: ipa adhoc | ipa appstore" >&2; exit 1 ;; esac
    mkdir -p "$OUT_DIR"
    cat > "$OUT_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>method</key><string>$EXPORT</string><key>teamID</key><string>$TEAM_ID</string><key>signingStyle</key><string>automatic</string><key>stripSwiftSymbols</key><true/></dict></plist>
PLIST
    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
      -archivePath "$OUT_DIR/ImprovedNotes.xcarchive" DEVELOPMENT_TEAM="$TEAM_ID" -allowProvisioningUpdates archive
    xcodebuild -exportArchive -archivePath "$OUT_DIR/ImprovedNotes.xcarchive" -exportOptionsPlist "$OUT_DIR/ExportOptions.plist" -exportPath "$OUT_DIR/ios" -allowProvisioningUpdates
    echo "Done: $OUT_DIR/ios/*.ipa"
    [ "$METHOD" = appstore ] && echo "Upload it with the Transporter app (or: xcrun altool), then invite testers in App Store Connect > TestFlight." \
                             || echo "Ad hoc: only devices registered to your Apple Developer account can install it (up to 100)." ;;
  *) echo "Usage: scripts/release/ios.sh device <UDID...> | ipa adhoc | ipa appstore   (add --no-ai to leave the token out)" >&2; exit 1 ;;
esac
