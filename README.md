# Improved Notes

Turn handwritten notes into a connected, searchable knowledge vault. AI runs **on your device first** and falls back to the cloud when a local model isn't available, through [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) hybrid inference.

Built for the #BuildHybridAI 2026 hackathon.

> Work in progress: the app is being rebuilt on Firebase. See the roadmap below.

## Stack

- React 19, TanStack Router, Tailwind CSS 4, Vite (single-page app)
- Firebase: Authentication, Firestore, Storage, App Check, Remote Config, Hosting
- Firebase AI Logic hybrid inference: Gemini Nano on Chrome and Android, Apple Foundation Models on iOS, cloud Gemini as fallback
- Capacitor (Android, iOS) and Tauri (macOS, Windows) shells around the same web build

## Development

```sh
npm install
cp .env.example .env   # fill in your Firebase web config
npm run dev
```

## Roadmap

- [x] Clean Vite single-page app scaffold
- [ ] Firebase data layer: one account synced across devices, offline-first, trash and version history
- [ ] Hybrid AI layer on Firebase AI Logic
- [ ] New dark UI
- [ ] Android, iOS, macOS and Windows apps

## License

Apache-2.0. See [LICENSE](LICENSE).
