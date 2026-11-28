# Improved Notes

Turn handwritten notes, lectures, PDFs and web pages into a connected, searchable knowledge vault. AI runs **on your device first** and falls back to the cloud when a local model isn't available, through [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) hybrid inference.

Built specifically for the hackathon, on Firebase, and open source under Apache-2.0.

**Live:** https://improvednotes-d0907.web.app (Chrome recommended; on-device AI needs Gemini Nano).

## Download

| Where | Get it |
|---|---|
| **Any browser** (phone, tablet, laptop) | https://improvednotes-d0907.web.app (Chrome recommended; on iPhone and iPad, Safari → Share → Add to Home Screen) |
| **Android phone or tablet** | **[Download ImprovedNotes.apk](https://github.com/bnair10-01/improved-notes/releases/latest/download/ImprovedNotes.apk)** ([release page and checksum](https://github.com/bnair10-01/improved-notes/releases/latest)) |
| **iPhone and iPad** | TestFlight link coming once Apple finishes the developer-program setup. Until then, use the web app above, or build it yourself (see [Native apps](#native-apps)). |

**Installing the Android app:** open the downloaded file and allow "Install unknown apps" for the app you opened it from (Chrome, Files...). It is one app for phones and tablets. To check the file, compare its SHA-256 with `ImprovedNotes.apk.sha256` on the release page.

**About AI in the Android download:** AI features (summaries, research, pictures) in this build use a shared test credential for Firebase App Check, because a sideloaded app can't prove itself to Google any other way yet. That credential will be revoked after judging; sign-in, notes, sync, the graph and study keep working afterwards, and AI keeps working in the web app. See [RELEASING.md](RELEASING.md).

## Why it exists

Notes pile up as photos, recordings and tabs you never reopen, and AI note tools send everything to a server. Improved Notes keeps short, private jobs on your device, uses the cloud only when a job needs it, shows you which one ran, and makes every AI answer point back to your own words.

## What you can do

- **Write first.** "Start writing" opens a blank note. A tools row sits above it: Scan, Voice or lecture, PDF or slides, Website, YouTube, Split into notes.
- **Insight column on every note:** streamed summary, Ask (answers cite numbered sources, with quotes checked against your text), flashcards and a quiz. A badge shows whether each AI call ran **On-device** or in the **Cloud**.
- **Scan handwriting** always gives the transcript and a mind map, and the note is saved the moment it's transcribed. Edits save as you go.
- **Pen and tablet ready.** Apple Pencil and other pens draw pressure-sensitive ink with palm rejection and an eraser, and iPads and Android tablets get the roomier layout with touch-sized controls.
- **Research more** on any note, topic, weak quiz topic or missed card: the AI suggests directions, you choose, and every result cites its sources.
- **Rename, delete and organise** every note and topic (with Undo and Trash), and a clear-everything option in Settings.
- **Study that adapts.** Flashcards step up from Guided (a hint) to Flip to Recall (type it from memory) after three right in a row, and back down after two misses; weak cards come first. Quizzes suggest a harder or easier one next from your score.
- **Topics you name.** The AI may suggest a topic for a note; nothing is filed until you accept. Topic pages have a topic-wide summary and Ask.
- **Import and split.** Websites and YouTube videos are divided into one note per idea under a topic you name in a preview. "Split into notes" does the same for any long note.
- **Obsidian-style graph, three sizes.** The whole-vault 3D graph shows every kind of note and how they connect (links you wrote, plus connections found from what notes say); notes nothing connects to yet sit on the outer edge and are listed under Not connected, with the closest matches to connect in one tap. Each note has a local graph, each topic a topic map, and every note a mind map (flat or 3D). Labels thin out so a phone stays readable, and you can search, filter and pinch or tap + / − to zoom.
- **Picture of a concept.** Nano Banana draws a clean picture of anything, or of a note, and the note lists what it shows and its parts, quoting your own text where it can. Tap for full size, or draw it again.
- **Read aloud** with a natural Gemini voice (device voice as fallback).
- **Accessible:** high contrast, reduced motion, large touch targets, keyboard and screen-reader support, and phone, tablet and foldable layouts.
- **Fluid motion.** Pages cross-fade, lists ease in, light and dark follow your device's setting live, and the apps open with an animated splash. Reduce motion turns it all off.
- **Sign-in:** Google or email. Guests last only for the current tab.

## How Firebase is used

| Product | What it does here |
|---|---|
| **Firebase AI Logic** (hybrid inference) | Every AI feature: handwriting transcription, summaries, flashcards, quizzes, mind maps, links, research, slides, audio, concept pictures (Nano Banana, cloud only). Runs on-device (Gemini Nano in Chrome) when available, otherwise in the cloud. See `src/lib/ai/`. |
| **App Check** | Verifies requests to AI Logic (reCAPTCHA Enterprise on the web; a revocable debug credential in the native test builds). |
| **Remote Config** | Tunes the routing policy (cloud model, image model, on-device size limit, kill switch) without a redeploy. |
| **Authentication** | Email and Google (native Google sign-in in the apps). Guests can capture first; signing up links the guest account so nothing is lost. |
| **Firestore** | One account, every device: live sync, offline cache, version history, Trash. Owner-only security rules. |
| **Storage** | Photos, audio, slides and pictures. |
| **Hosting** | The web app, with a strict content security policy and security headers. |

### Hybrid routing (`src/lib/ai/route.ts`)

- Short text jobs (summaries, flashcards, quizzes, links, mind maps) run **on-device first**, with cloud fallback. They work offline.
- Long inputs go straight to the cloud, as do audio, slides, diagrams, research and pictures.
- Handwriting tries on-device first, then falls back to the stronger cloud model.
- The UI records where each call actually ran (`src/lib/ai/status.ts`) and shows it as a badge.
- A test fails if any AI provider other than Firebase AI Logic appears in the source.

## Honest by design

- Every AI answer cites where it came from. Quotes are checked against your own text, and a quote that isn't there is dropped rather than shown.
- Nothing is filed or renamed by the AI without you accepting it; topics are named by you.
- Failures say what happened ("couldn't reach the model", "no on-device model on this device") instead of failing silently.

## Your notes are never lost

- "Delete" moves a note to **Trash**. Nothing is purged automatically.
- The security rules only allow permanent deletion of a note that is already in Trash.
- Every note keeps a **version history**; restoring is itself undoable.
- Edits made on another device while you're typing prompt you (keep mine / take theirs / keep both) instead of overwriting.
- **Settings > Back up everything** downloads a zip of every note (including Trash), history, study data and files. Restoring it adds what's missing and never overwrites.
- `scripts/setup-backups.sh` turns on Firestore point-in-time recovery, scheduled backups and Storage versioning for your project.

## Security

- Firestore and Storage rules: owner-only access, delete only from Trash, size and shape limits (tested against the emulators).
- Hosting sends a content security policy, frame, referrer and permissions headers; the embedded video player page has its own policy and checks message origins.
- App Check protects AI calls. Secrets are never committed: `.env`, the Firebase app config files and the Android signing key are git-ignored, and the release scripts refuse to ship a development token unless told to.
- Guest sessions end with the tab, and Android backups are switched off so notes don't leak into device backups.

## Run it yourself

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

### Sign-in setup (Firebase console)

Email and guest sign-in work out of the box. Google must be switched on once in the Firebase console, then `npm run doctor` shows it as passing.

**Google** (2 minutes): Authentication > Sign-in method > Google > Enable, choose a support email, Save.

**Authorized domains**: Authentication > Settings > Authorized domains. Add your Hosting domain (`<project>.web.app`) and `localhost` for local development.

Sign in with Apple is not offered: it needs a paid Apple Developer account.

## Native apps

The same web build is wrapped with Capacitor for Android and iOS (`android/`, `ios/`). To share the phone, tablet and iPad apps (signed Android file, TestFlight, how to handle the App Check token), see [RELEASING.md](RELEASING.md).

```sh
npm run android:build    # builds android/app/build/outputs/apk/debug/app-debug.apk (needs JDK 17 or 21, not newer)
npm run cap:sync         # rebuild the web app and copy it into both native projects
npx cap open ios         # open in Xcode
```

- **Android:** the signed release build installs on phones and tablets and runs on the Android emulator: guest start, Home, research and cited answers all work inside the app.
- **iOS:** installed and run on a physical iPhone and iPad (free provisioning, development build) and on the simulator.
- **AI inside the native apps:** every call still goes through Firebase AI Logic (the same web SDK in the WebView), with App Check. On-device Gemini Nano (Android) and Apple's on-device model (iOS) need the native Firebase AI Logic hybrid SDKs behind a Capacitor plugin that is **not written yet**, so inside the apps AI runs in the cloud and the badge says Cloud. On-device inference is demonstrated in Chrome on the web.
- **Sign-in:** Start writing (a guest), Google and email work in the apps. Google uses the device's native sign-in, because a browser popup doesn't work in a WebView. App Check's reCAPTCHA also doesn't work in a WebView, so native builds use a registered debug credential; the proper fix (Play Integrity / App Attest) needs store accounts and is described in [RELEASING.md](RELEASING.md).
- **Native test build:** `VITE_NATIVE_SELFTEST=1 npm run cap:sync` adds a launch-time panel that signs in as a guest, makes a real AI call and reports whether it ran on-device or in the cloud. It is not in normal builds.
- **macOS and Windows:** not started.

## Status

Verified automatically (280 unit tests pass; 42 emulator tests pass):
- Security rules: owner-only access, delete only from Trash, version retention, share links.
- Data layer against the emulators: guest to account, migration of guest notes into an existing account, Trash and permanent delete, version history, share links, backup and restore.
- Two devices on one account: live propagation, offline writes syncing on reconnect, conflict detection. (Three of these two-device tests fail on Node 26 in the emulator harness, identically before and after recent changes; they pass in real browsers.)
- Offline uploads: files captured offline are kept on the device and uploaded on reconnect.
- Routing and schema conversion, and the single-AI-provider check.

Verified by hand on the live site and on devices:
- Notebook tree, search, Insight column, topics, website and YouTube import, Split into notes, topic suggestions, the 3D graph and topic maps, concept pictures, research, rename and delete, read-aloud, high contrast, reduced motion, pen ink, and the phone, tablet and foldable layouts.
- The web app, an iPhone and an iPad (development builds), and the Android emulator.

Not yet verified or not built:
- Slides and audio imports are not split into notes automatically; press **Split into notes** afterwards.
- A physical Android phone; `scripts/setup-backups.sh` Storage commands are unchecked.

## For judges

### Who it is for, and why they would use it

**Students and self-learners** who collect notes as photos of handwritten pages, lecture recordings, PDFs, web pages and videos, and never go back to them. Example situation: after a week of lectures you have 40 photos, two recordings and a stack of links. Today you retype, or paste everything into a chatbot that forgets it tomorrow and sends your notes to a server.

Improved Notes turns each source into notes you can search, question, quiz yourself on and see connected, and every AI answer points to the sentence of yours it came from. Short, private jobs stay on the device, so they are free and work offline. It differs from a general chatbot in three ways: it only answers from your notes and cites them, it checks its own quotes, and it never files or renames anything without you accepting it.

### What was built or improved during the event

- **New or existing:** existing project. It began as an earlier notes app with a different backend and AI service. This repository's history starts on 25 November 2026, during the event, and is the rebuild. The earlier notes app was also built by me, a day before (24th November 2026) on lovable as a challenge to see what can be built on 1 month's worth of credit, the link for the original build is as follows: https://ink-to-insight-notes.lovable.app.
- **Rebuilt on Firebase during the event:** authentication (Google and email, guest to account linking), the Firestore data layer with offline cache, version history and Trash, security rules, Storage with an offline upload queue, App Check, Remote Config, and **every AI call** through Firebase AI Logic hybrid inference. The earlier backend and AI gateway were deleted.
- **New features during the event:** on-device-first routing with an On-device / Cloud badge, cited answers with checked quotes, adaptive flashcards and quizzes, website and YouTube import with split-into-notes, research more, concept pictures (Nano Banana), the 3D vault graph with topic maps, pen ink with palm rejection, rename / delete / clear everything, backups, and the Android, iPhone and iPad apps.
- **Third-party work:** React, TanStack, Tailwind, shadcn/ui components, Three.js, Capacitor, and Firebase and Gemini services. The application code, routing, AI tasks and security rules are this project's own.

### How AI was used

**In the finished product** (all through Firebase AI Logic, `src/lib/ai/`):

| Job | Model | Why this choice |
|---|---|---|
| Short summaries, flashcards, quizzes, links, mind maps | Gemini Nano on-device, falling back to a Gemini cloud model | Private, free and offline for the common case; the cloud covers devices without Nano |
| Handwriting, long documents, slides, audio, research | Gemini cloud models | Needs a bigger model or a long context |
| Concept pictures | Nano Banana image model (cloud) | Clean, labelled pictures that on-device models can't draw |
| Read aloud | Gemini text-to-speech | Natural voice; the device voice is the fallback |

Project-specific AI decisions already built in:
- **Routing by task and size** (`route.ts`, tuned live from Remote Config): routing and size rules are unit tested, and the UI records where each call actually ran.
- **Citations that are checked, not trusted:** answers cite numbered sources, and each quote is searched for in your text. A quote that isn't there is dropped (`ask` and the picture and split tasks in `src/lib/ai/tasks.ts`; the part-quote check is unit tested).
- **Nothing is filed by the AI:** topics are suggested, and you accept or name them.
- **A rejected approach:** an earlier feature built interactive 3D models from notes. In testing, the structured output was unreliable, so it was replaced with the concept picture plus a quoted list of its parts.

How quality was assessed: 280 unit tests (routing, schema conversion, citation checks, spaced-repetition rules, conflict handling), a test that fails if any non-Firebase AI provider appears, and hands-on runs on the live site and devices. Limits: no automated measure of answer quality beyond the quote check, and on-device AI is only exercised in Chrome with Nano, not inside the native apps.

**During development:** Claude Code (Anthropic) wrote much of the code under my direction. A person checked it by running the tests, using the live site and testing on a real iPhone and iPad. What the checks found, and what happened:
- The first pen stroke on an iPad was lost; found by hand on the iPad and fixed.
- The graph screen could freeze in a render loop ("maximum update depth"); found in a test run, fixed.
- A note screen crashed on a hook-ordering mistake; found in a test run, fixed.
- The 3D-model feature above was rejected after testing and replaced.

### How to use it, and the results

- **Access:** https://improvednotes-d0907.web.app in Chrome (no account needed: press **Start writing**), the Android APK above, or iPhone and iPad through the web app. No cost to the user. AI needs an internet connection; on-device jobs and your cached notes work offline.
- **Main task:** capture or write a note, then use the Insight column. A successful result is a summary and answers whose numbered sources open the exact passage in your own note.
- **Checks to try** (also what the scripted run covers):

| Case | Should happen | Result |
|---|---|---|
| Write three lines, select them, Summarize | Streamed summary with an On-device or Cloud badge | Passed in the scripted run on the live site |
| Ask a question about a note | Answer with numbered sources; quotes found in the note | Passed; a quote that isn't in the note is dropped before it reaches the screen |
| Paste a website link | Preview split into notes under a topic you name | Passed |
| Concept picture of a topic | A picture, what it shows and its parts, about 7 seconds | Passed |
| Delete a note, then try to erase it from the list | Moves to Trash; permanent delete only from Trash | Passed against the security rules (emulator) |
| Edit the same note on two devices, one offline | Prompt to keep mine / theirs / both; nothing lost | Passed on the emulators in a real browser; 3 harness tests fail on Node 26 |
| Turn the network off, then make flashcards | Still works on-device | Needs Chrome with Gemini Nano; falls back to cloud message otherwise |

The scripted run on the live site (`npm run demo`, visible Chrome) passed 72 checks and found 2 problems; the report is kept locally.

### Limits, and what happens when something goes wrong

| Situation | What the app does |
|---|---|
| No on-device model on this device | Uses the cloud model; the badge says Cloud |
| AI service unreachable or blocked (for example headless Chrome fails App Check) | Says AI is unavailable and why; notes, sync and search keep working |
| A quote the AI gives isn't in your note | Dropped instead of shown |
| The same note edited on two devices | Conflict prompt instead of overwriting |
| Offline while capturing a photo or recording | Kept on the device and uploaded when you're back online |
| Deleted by mistake | Trash and Undo; version history for edits |

Known limits: native apps use the cloud model only (no native on-device plugin yet); the Android download uses a shared test credential for App Check; iPhone and iPad builds are not yet on TestFlight; slides and audio imports aren't split into notes automatically; macOS and Windows aren't built; answer quality beyond the quote check isn't measured automatically. The 3D graph and mind map fall back to a plain list when 3D isn't available on the device.

### Reviewing it

- **App Check:** AI calls are protected by App Check (reCAPTCHA Enterprise on the web). Use a visible, non-headless Chrome; automated or headless browsers are scored as bots and AI is blocked for that session.
- **Where to read the code:** AI routing in `src/lib/ai/route.ts` and `run.ts`, all prompts and tasks in `src/lib/ai/tasks.ts`, security rules in `firestore.rules` and `storage.rules`.

## License

Apache-2.0. See [LICENSE](LICENSE).
