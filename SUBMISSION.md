# Submission notes

Draft text for the submission form, plus an honest checklist. Nothing here should be submitted until the unchecked items are true. Confirm the exact deadline on the submission page.

## Description (draft)

**Improved Notes** turns what you read, hear and write into a connected knowledge vault. Start on a blank page, or capture a handwritten page, a lecture, a PDF, a website or a YouTube video. Long sources are divided into one note per idea under a topic you name. Every note gets an Insight column (summary, Ask, flashcards, quiz) where each answer cites numbered sources with quotes checked against your own text. Notes connect in a 3D graph, and any concept or note can become a clean picture, with what it shows and its parts quoted from your own text.

Every AI feature goes through **Firebase AI Logic hybrid inference**: short jobs run on-device with Gemini Nano in Chrome, work offline, and never leave the device; long documents and heavy jobs go to the cloud model. A badge on each result shows where it ran. Routing is decided per task in `src/lib/ai/route.ts` and tuned from **Remote Config**. **App Check** protects the AI calls, **Authentication** (Google and email) gives one account across devices, **Firestore** keeps notes in sync with offline support, version history and a Trash that is never emptied automatically, and **Hosting** serves the app.

**Existing app:** this project began as an earlier notes app. During the submission period the backend, auth, data layer and all AI calls were rebuilt on Firebase; the earlier backend and AI gateway were removed.

## Requirement checklist

- [x] AI runs through Firebase AI Logic (`src/lib/ai/run.ts`; a test fails if another AI provider appears)
- [x] Uses Authentication, Firestore, Remote Config, App Check, Storage, Hosting
- [x] Public repository with an Apache-2.0 license
- [x] Runs against a live Firebase project (`improvednotes-d0907`; `npm run doctor`)
- [x] Hosted demo URL: https://improvednotes-d0907.web.app
- [x] Scripted end-to-end run on the live site (72 checks passed, 2 problems; see `npm run demo`)
- [ ] Clean demo run after the latest fixes (picture notes, note search retry)
- [ ] On-device inference confirmed **in the app** in Chrome: Nano works from the console, but the On-device badge on a short text task has not been seen yet
- [ ] App Check debug token documented for judges (the live site uses reCAPTCHA Enterprise; judges need a visible, non-headless Chrome)
- [ ] Demo video, 3 minutes or less, public or unlisted on YouTube, English
- [ ] Platform category selected (Web, Chrome). Android and iOS only if their native on-device paths are built and shown; today they are shells that use the cloud model

## Known limits (say these plainly)

- Slides and audio imports are not split into notes automatically; the user presses Split into notes afterwards.
- Native apps: no native Google sign-in, no native on-device AI plugin; Android not run on a device; macOS and Windows not started.
- reCAPTCHA scores headless Chrome as a bot, so AI is blocked there. Use a visible Chrome.

## After the hackathon

- Revoke the App Check debug token.

## Demo video outline (3:00 max)

1. Start writing on a blank page; select a short passage and Summarize. Show the **On-device** badge (0:30).
2. Turn off the network; make flashcards from the note, still on-device (0:20).
3. Paste a website or YouTube link; preview the split, name the topic, accept. One note per idea appears, linked (0:40).
4. Ask a question in the Insight column; show the numbered sources and the quote (0:25).
5. Open the 3D graph and a topic map; then draw a picture of a concept from a note and read what it shows, with quotes from your own text (0:40).
6. Settings: high contrast and read-aloud; show it on a phone-width window (0:15).
7. Close on the Firebase products used and the live URL (0:10).
