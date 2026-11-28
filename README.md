# Improved Notes

Turn handwritten notes into a connected, searchable knowledge vault. AI runs **on your device first** and falls back to the cloud when a local model isn't available, through [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) hybrid inference.

Built for the #BuildHybridAI 2026 hackathon.

**Live:** https://improvednotes-d0907.web.app (Chrome recommended; on-device AI needs Gemini Nano).

> **Status:** the web app runs against a live Firebase project. The native apps are shells that use the cloud model only. See [Status](#status).

## What you can do

- **Write first.** "Start writing" opens a blank note. A tools row sits above it: Scan, Voice or lecture, PDF or slides, Website, YouTube, Split into notes.
- **Insight column on every note:** streamed summary, Ask (answers cite numbered sources, with quotes checked against your text), flashcards and a quiz. A badge shows whether each AI call ran **On-device** or in the **Cloud**.
- **Study that adapts.** Flashcards step up from Guided (a hint) to Flip to Recall (type it from memory) after three right in a row, and back down after two misses; weak cards come first. Quizzes suggest a harder or easier one next from your score.
- **Fluid motion.** Pages cross-fade, lists ease in, light and dark follow your device's setting live, and phone apps open with an animated splash. Reduce motion turns it all off.
- **Topics you name.** The AI may suggest a topic for a note; nothing is filed until you accept. Topic pages have a topic-wide summary and Ask.
- **Import and split.** Websites and YouTube videos are divided into one note per idea under a topic you name in a preview. "Split into notes" does the same for any long note.
- **3D vault graph.** Connections between notes are found automatically. Topic maps show "↗" satellites for notes in other topics.
- **3D model from a note.** Nano Banana first draws a clean reference picture, then the model is built to match it: see-through shells, a few clearly separated parts, and a note quote for each. The picture is kept beside the model.
- **Read aloud** with a natural Gemini voice (device voice as fallback), pencil ink, high contrast, reduced motion, and phone, tablet and foldable layouts.
- **Sign-in:** Google or email. Guests last only for the current tab.

## How Firebase is used

| Product | What it does here |
|---|---|
| **Firebase AI Logic** (hybrid inference) | Every AI feature: handwriting transcription, summaries, flashcards, quizzes, mind maps, links, slides, audio, 3D (plus a Nano Banana reference picture, cloud only). Runs on-device (Gemini Nano in Chrome) when available, otherwise in the cloud. See `src/lib/ai/`. |
| **App Check** | Verifies requests to AI Logic (reCAPTCHA Enterprise; debug token for local and judging use). |
| **Remote Config** | Tunes the routing policy (cloud model, on-device size limit, kill switch) without a redeploy. |
| **Authentication** | Email and Google. Guests can capture first; signing up links the guest account so nothing is lost. |
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

1. Create a project on the Blaze plan. Enable Authentication (Email, Google), Firestore, Storage, Remote Config, App Check and AI Logic.
2. Put the web app config in `.env` (see `.env.example`).
3. For App Check, add a reCAPTCHA Enterprise site key as `VITE_APPCHECK_SITE_KEY`, or register a debug token and set `VITE_APPCHECK_DEBUG_TOKEN`.
4. `firebase deploy --only firestore:rules,storage,hosting`
5. Optionally run `scripts/setup-backups.sh <project-id>`.

On-device inference needs Chrome with Gemini Nano available (see `chrome://on-device-internals`). Without it the app uses the cloud model automatically.

## Sign-in setup (Firebase console)

Email and guest sign-in work out of the box. Google must be switched on once in the Firebase console, then `npm run doctor` shows it as passing.

**Google** (2 minutes): Authentication > Sign-in method > Google > Enable, choose a support email, Save. Firebase creates the web client for you.

**Authorized domains**: Authentication > Settings > Authorized domains. Add your Hosting domain (`<project>.web.app`) and `localhost` for local development.

Sign in with Apple is not offered: it needs a paid Apple Developer account.

On iPhone and Android, the apps use email sign-in for now. Google uses a browser pop-up, which a WebView blocks, so the button is hidden there (see Status).

## Native apps

The same web build is wrapped with Capacitor for Android and iOS (`android/`, `ios/`).

```sh
npm run android:build    # builds android/app/build/outputs/apk/debug/app-debug.apk (needs JDK 17 or 21, not newer)
npm run cap:sync         # rebuild the web app and copy it into both native projects
npx cap open ios         # open in Xcode
```

- **Android:** the debug APK builds (JDK 17 or 21) and runs on the Android emulator: guest start, Home, research and cited answers all work inside the app. Camera and microphone permissions are declared. Not yet run on a physical Android phone.
- **iOS:** builds and runs on the iOS 17.5 simulator with the same checks passing. Camera, microphone and photo permissions are declared. A build for a physical iPhone needs your Apple ID signed in to Xcode and Developer Mode on the phone.
- **AI inside the native apps:** every call still goes through Firebase AI Logic (the same web SDK in the WebView), with App Check. On-device Gemini Nano (Android) and Apple's on-device model (iOS) need the native Firebase AI Logic hybrid SDKs behind a Capacitor plugin that is **not written yet**, so inside the apps AI runs in the cloud and the badge says Cloud. On-device inference is demonstrated in Chrome on the web.
- **Native test build:** `VITE_NATIVE_SELFTEST=1 npm run cap:sync` adds a launch-time panel that signs in as a guest, makes a real AI call and reports whether it ran on-device or in the cloud. It is not in normal builds.
- **Sign-in:** email only inside the apps. Google sign-in uses a browser popup, which doesn't work in a WebView, so that button is hidden there until `@capacitor-firebase/authentication` is added. App Check's reCAPTCHA also doesn't work in a WebView, so native builds use the debug token from `.env` (local test builds only; never distribute them).
- **macOS and Windows:** not started. Tauri needs Rust, which is not installed.

## Status

Verified on the live site with a scripted browser run (`npm run demo`, visible Chrome; 72 checks passed, 2 problems, report and video kept locally):
- Notebook tree, search, Insight column, topics, website and YouTube import, Split into notes, topic suggestions, the 3D graph and topic maps, 3D models from notes, read-aloud, high contrast, reduced motion, and the phone, tablet and foldable layouts.
- reCAPTCHA scores headless Chrome as a bot, so AI scenes only work in a visible Chrome window.

Verified (automated, 200 unit tests + 42 emulator tests):
- Security rules: owner-only access, delete only from Trash, version retention, share links.
- Data layer against the emulators: guest to account, migration of guest notes into an existing account, Trash and permanent delete, version history, share links, backup and restore.
- Two devices on one account: live propagation, offline writes syncing on reconnect, conflict detection.
- Offline uploads: files captured offline are kept on the device and uploaded on reconnect.
- Routing and schema conversion; a test fails if any AI provider other than Firebase AI Logic appears in the source.
- The app boots in Chrome against the emulators; guest capture and email sign-up work.

Not yet verified or not built:
- **On-device inference:** Gemini Nano answers from the Chrome console, but the in-app On-device badge on a short text task has not been confirmed yet. Without Nano the app uses the cloud model.
- Slides and audio imports are not split into notes automatically; press **Split into notes** afterwards.
- `scripts/setup-backups.sh`: the Firestore commands match the gcloud docs; the Storage commands are unchecked.
- Android and iOS run in their emulator and simulator (cloud AI only); not yet on physical devices. macOS and Windows are not started. See "Native apps" above.

## For judges: App Check

AI calls are protected by App Check (reCAPTCHA Enterprise). Use a visible, non-headless Chrome. Automated or headless browsers are scored as bots and AI is blocked for that session.

## License

Apache-2.0. See [LICENSE](LICENSE).
