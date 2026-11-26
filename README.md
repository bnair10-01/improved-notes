# Improved Notes

Turn handwritten notes into a connected, searchable knowledge vault. AI runs **on your device first** and falls back to the cloud when a local model isn't available, through [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) hybrid inference.

Built for the #BuildHybridAI 2026 hackathon.

> **Status: work in progress.** The data layer, sync and backup are built and tested against the Firebase emulators. The app has **not** yet been run against a live Firebase project, and the redesign and the native apps are not started. See [Status](#status).

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
```

### Using a real Firebase project

1. Create a project on the Blaze plan. Enable Authentication (Email, Google, Apple), Firestore, Storage, Remote Config, App Check and AI Logic.
2. Put the web app config in `.env` (see `.env.example`).
3. For App Check, add a reCAPTCHA Enterprise site key as `VITE_APPCHECK_SITE_KEY`, or register a debug token and set `VITE_APPCHECK_DEBUG_TOKEN`.
4. `firebase deploy --only firestore:rules,storage,hosting`
5. Optionally run `scripts/setup-backups.sh <project-id>`.

On-device inference needs Chrome with Gemini Nano available (see `chrome://on-device-internals`). Without it the app uses the cloud model automatically.

## Status

Verified (automated):
- Security rules: owner-only access, delete only from Trash, version retention, share links (24 tests against the Firestore and Storage emulators).
- Data layer against the emulators: guest to account, migration of guest notes into an existing account, Trash and permanent delete, version history, share links, backup and restore (16 tests).
- Two devices on one account: live propagation, offline writes syncing on reconnect, conflict detection.
- Routing and schema conversion; a test fails if any AI provider other than Firebase AI Logic appears in the source.
- The app boots in Chrome against the emulators; guest capture and email sign-up work.

Not yet verified or not built:
- **Not run against a live Firebase project**: AI Logic calls, App Check, Remote Config fetch, Google/Apple sign-in.
- **On-device inference (Gemini Nano) has not been exercised.**
- No upload queue yet: photo and audio uploads fail while offline (notes themselves work offline).
- `scripts/setup-backups.sh`: the Firestore commands match the gcloud docs; the Storage commands are unchecked.
- New design, Android, iOS, macOS and Windows apps are not started.

## License

Apache-2.0. See [LICENSE](LICENSE).
