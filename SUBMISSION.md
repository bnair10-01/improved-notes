# #BuildHybridAI 2026 submission notes

Draft text for Devpost, plus an honest checklist. Nothing here should be submitted until the unchecked items are true.

## Description (draft)

**Improved Notes** turns handwritten notes into a connected knowledge vault. Every AI feature (handwriting transcription, summaries, flashcards, quizzes, mind maps, link suggestions) goes through **Firebase AI Logic hybrid inference**: short jobs run on-device with Gemini Nano in Chrome, work offline, and never leave the device; long documents and heavy jobs go to the cloud model. Routing is decided per task in `src/lib/ai/route.ts` and tuned from **Remote Config**. **App Check** protects the AI calls, **Authentication** gives one account across devices, and **Firestore** keeps notes in sync with offline support, version history and a Trash that is never emptied automatically.

**Existing app:** this project began as an earlier notes app. During the submission period the backend, auth, data layer and all AI calls were rebuilt on Firebase; the earlier backend and AI gateway were removed.

## Requirement checklist

- [x] AI runs through Firebase AI Logic (`src/lib/ai/run.ts`; a test fails if another AI provider appears)
- [x] Uses Authentication, Firestore, Remote Config, App Check, Storage (code written, emulator-tested except Remote Config and App Check)
- [x] Public repository with an Apache-2.0 license
- [ ] Runs against a live Firebase project (run `npm run doctor`)
- [ ] App Check enabled with a registered debug token, documented for judges
- [ ] On-device inference confirmed in Chrome (Gemini Nano); badge shows On-device, then Cloud when it is off
- [ ] Hosted demo URL (Firebase Hosting)
- [ ] Demo video, 3 minutes or less, public on YouTube, English
- [ ] Platform category selected (Web Chrome); Android and iOS only if their native on-device paths are built and shown

## Unblocking the live checks

1. Create a Firebase project on the Blaze plan; enable Authentication (Email, Google, Apple, Anonymous), Firestore, Storage, Remote Config, App Check and AI Logic.
2. Copy the web app config into `.env`; register an App Check debug token and set `VITE_APPCHECK_DEBUG_TOKEN`.
3. `npm run doctor`, then `firebase deploy --only firestore:rules,storage,hosting`.
4. In Chrome, enable the on-device model (see `chrome://on-device-internals`) and run the demo.

## Demo video outline (about 2:30)

1. Capture a handwritten page as a guest; show the transcript and the **On-device** badge (0:30).
2. Turn off the network; summarize and make flashcards from a note, still on-device (0:30).
3. Paste a long document; show it route to **Cloud** (0:20).
4. Sign in on a second device; the same notes appear, then edit on both and resolve the conflict (0:40).
5. Trash a note, restore it, restore an earlier version, export the backup (0:30).
