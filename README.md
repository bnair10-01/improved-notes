# Improved Notes

Turn handwritten notes into a connected, searchable knowledge vault. AI runs **on your device first** and falls back to the cloud when a local model isn't available, through [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) hybrid inference.

Built for the #BuildHybridAI 2026 hackathon.

> **Status: work in progress.** The data layer, sync, offline queue and backup are built and tested against the Firebase emulators. The app has **not** yet been run against a live Firebase project. The Dark v2 theme is applied; the full redesign and the native apps are not finished. See [Status](#status).

## How Firebase is used

| Product | What it does here |
|---|---|
| **Firebase AI Logic** (hybrid inference) | Every AI feature: handwriting transcription, summaries, flashcards, quizzes, mind maps, links, slides, audio, 3D. Runs on-device (Gemini Nano in Chrome) when available, otherwise in the cloud. See `src/lib/ai/`. |
| **App Check** | Verifies requests to AI Logic (reCAPTCHA Enterprise; debug token for local and judging use). |
| **Remote Config** | Tunes the routing policy (cloud model, on-device size limit, kill switch) without a redeploy. |
| **Authentication** | Email, Google and Apple. Guests can capture first; signing up links the guest account so nothing is lost. |
| **Firestore** | One account, every device: live sync, offline cache, version history, Trash. |
| **Storage** | Photos, audio, slides and models. |
| **Hosting** | The web app. |

### Hybrid routing (`src/lib/ai/route.ts`)

- Short text jobs (summaries, flashcards, quizzes, links, mind maps) run **on-device first**, with cloud fallback. They work offline.
- Long inputs go straight to the cloud, as do audio, slides, diagrams and 3D.
- Handwriting tries on-device first, then falls back to the stronger cloud model.
- The UI records where each call actually ran (`src/lib/ai/status.ts`).

## Your notes are never lost

- "Delete" moves a note to **Trash**. Nothing is purged automatically.
- The security rules only allow permanent deletion of a note that is already in Trash.
- Every note keeps a **version history**; restoring is itself undoable.
- Edits made on another device while you're typing prompt you (keep mine / take theirs / keep both) instead of overwriting.
- **Settings > Back up everything** downloads a zip of every note (including Trash), history, study data and files. Restoring it adds what's missing and never overwrites.
- `scripts/setup-backups.sh` turns on Firestore point-in-time recovery, scheduled backups and Storage versioning for your project.

## Development

```sh
npm install
cp .env.example .env     # add your Firebase web config, or set VITE_USE_EMULATORS=true
npm run dev
```

Run everything locally with no Firebase project, against the emulators (needs Java 21+):

```sh
npm run emulators        # in one terminal
VITE_USE_EMULATORS=true npm run dev
```

### Tests

```sh
npm test                 # unit tests
npm run test:emulators   # security rules, data layer, two-device sync, backup (starts the emulators itself)
npm run build            # strict typecheck + production build
npm run doctor           # checks a live Firebase project (Auth, Firestore, Storage, App Check, AI Logic)
```

### Using a real Firebase project

1. Create a project on the Blaze plan. Enable Authentication (Email, Google, Apple), Firestore, Storage, Remote Config, App Check and AI Logic.
2. Put the web app config in `.env` (see `.env.example`).
3. For App Check, add a reCAPTCHA Enterprise site key as `VITE_APPCHECK_SITE_KEY`, or register a debug token and set `VITE_APPCHECK_DEBUG_TOKEN`.
4. `firebase deploy --only firestore:rules,storage,hosting`
5. Optionally run `scripts/setup-backups.sh <project-id>`.

On-device inference needs Chrome with Gemini Nano available (see `chrome://on-device-internals`). Without it the app uses the cloud model automatically.

## Native apps

The same web build is wrapped with Capacitor for Android and iOS (`android/`, `ios/`).

```sh
npm run android:build    # builds android/app/build/outputs/apk/debug/app-debug.apk (needs JDK 17 or 21, not newer)
npm run cap:sync         # rebuild the web app and copy it into both native projects
npx cap open ios         # open in Xcode
```

- **Android:** the debug APK builds. It has not been run on a device or emulator.
- **iOS:** builds for the simulator and launches there (the interface renders and loads). Not run on a physical iPhone. The first build on a new machine needs `sudo xcodebuild -runFirstLaunch` once.
- **Inside the native apps** the AI uses the cloud model: on-device Gemini Nano (Android) and Apple Foundation Models (iOS) need a native Firebase AI Logic plugin that is **not written yet**.
- **Sign-in:** email only inside the apps. Google and Apple sign-in use browser popups, which don't work in a WebView, so those buttons are hidden there until `@capacitor-firebase/authentication` is added. App Check's reCAPTCHA also doesn't work in a WebView, so native builds need a debug token for now.
- **macOS and Windows:** not started. Tauri needs Rust, which is not installed.

## Status

Verified (automated, 101 unit tests + 42 emulator tests):
- Security rules: owner-only access, delete only from Trash, version retention, share links.
- Data layer against the emulators: guest to account, migration of guest notes into an existing account, Trash and permanent delete, version history, share links, backup and restore.
- Two devices on one account: live propagation, offline writes syncing on reconnect, conflict detection.
- Offline uploads: files captured offline are kept on the device and uploaded on reconnect.
- Routing and schema conversion; a test fails if any AI provider other than Firebase AI Logic appears in the source.
- The app boots in Chrome against the emulators; guest capture and email sign-up work.

Not yet verified or not built:
- **Not run against a live Firebase project**: AI Logic calls, App Check, Remote Config fetch, Google/Apple sign-in. `npm run doctor` checks all of these once a project exists.
- **On-device inference (Gemini Nano) has not been exercised.**
- `scripts/setup-backups.sh`: the Firestore commands match the gcloud docs; the Storage commands are unchecked.
- Design: the Dark v2 palette and fonts are applied. The new workspace layout (insight column), topics, first-run screens, 3D viewer changes and pen tools are not built.
- Android builds as a debug APK (not run on a device or emulator); iOS builds and launches on the simulator; macOS and Windows are not started. See "Native apps" above.

## License

Apache-2.0. See [LICENSE](LICENSE).
