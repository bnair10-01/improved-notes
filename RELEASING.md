# Releasing Improved Notes

Everything here is ready to run, but nothing shareable has been built yet. Do this after you've checked the app on your own devices.

The web, iPhone, iPad, Android phone and Android tablet all run the same code. Android is **one file for phones and tablets**. iOS is **one app for iPhone and iPad**.

## 1. The web app

```sh
npm run deploy:web      # builds without any token, refuses to deploy if one leaked, then deploys
```

Link: https://improvednotes-d0907.web.app

## 2. The App Check token: can it be hidden?

**No, not really.** Anything inside an app file can be dug out: an APK is a zip, and the web code inside it is plain text. Hiding or scrambling the token only slows down someone casually looking. It would give a false sense of security, so this repo doesn't pretend to.

What actually protects you, in order of value:

1. **A token made only for the shared build, which you can revoke.** Never put your own development token in a shared file. The release scripts refuse to build if you try.
   - Make one: run `uuidgen`.
   - Register it for each app that will use it: Firebase console → App Check → Apps → pick the Android app (and, separately, the iOS app) → ⋮ → Manage debug tokens → Add → paste it.
   - Build with it: `SHARE_APPCHECK_TOKEN=<that uuid> scripts/release/android.sh`
   - When you're done sharing, delete it in the same screen. Every copy of the app loses AI at once. Sign-in, notes and sync keep working.
2. **Quotas and budget alerts**, so even a leaked token can't run up a bill:
   - Firebase console → AI Logic → settings: set the per-user rate limit.
   - Google Cloud console → Billing → Budgets & alerts: add a budget (for example $5 and $20) with email alerts.
3. **A short sharing window.** Share, let people try it, revoke.
4. **The proper fix, later:** real attestation, so no secret ships at all. That is Play Integrity on Android and App Attest on iOS (via `@capacitor-firebase/app-check`). Both need accounts you don't have yet (Google Play Console, paid Apple Developer Program), and Play Integrity generally wants the app installed from Google Play.

If you'd rather ship with no token at all, add `--no-ai`: the app signs in and syncs, and AI features say they're unavailable.

## 3. Android (phone and tablet, one file)

One time: JDK 21 (already installed at `/opt/homebrew/opt/openjdk@21`).

```sh
SHARE_APPCHECK_TOKEN=<your uuid> scripts/release/android.sh        # AI works
scripts/release/android.sh --no-ai                                  # no token inside
```

It creates your release signing key the first time, in `~/.improved-notes/`. **Back that folder up.** If it's lost, installed copies can never be updated. Then it builds and gives you, in `release/`:

- `ImprovedNotes-1.0.apk`: send this to people. It installs on Android phones and tablets. They need to allow "Install unknown apps" for whatever app they open it from (Files, Chrome, WhatsApp...).
- `ImprovedNotes-1.0.aab`: this is what Google Play wants (a $25 one-time Play Console account; use the Internal testing track for up to 100 testers without review).

**Google sign-in in the release app:** the release key has its own fingerprint. After the first build, add it to Firebase once:

```sh
keytool -list -v -keystore ~/.improved-notes/release.keystore -alias improvednotes | grep SHA
npx firebase apps:android:sha:create 1:156161385922:android:231f8fea79f3012079625b <the SHA-1> --project improvednotes-d0907
```

(If you upload to Play with Play App Signing, also add the SHA-1 shown in Play Console → App integrity.)

To update an installed copy, raise `versionCode` (and `versionName`) in `android/app/build.gradle`, then run the script again with the same key.

## 4. iPhone and iPad (one app)

Apple decides who may install an iOS app, so a file can't just be sent around like an APK.

| You have | You can | How |
|---|---|---|
| Free Apple ID (what you have now) | Install on **your own** iPhone and iPad. Stops opening after 7 days; run again to renew. | `scripts/release/ios.sh device <UDID> <UDID>` (`xcrun devicectl list devices` lists them) |
| Paid Apple Developer Program ($99/yr) | **TestFlight**: invite testers by email (up to 100 instantly, up to 10,000 after a short review). Builds last 90 days. | `TEAM_ID=<your team> scripts/release/ios.sh ipa appstore`, then upload with the Transporter app, then App Store Connect → TestFlight |
| Paid program | **Ad hoc**: up to 100 devices you've registered. | `TEAM_ID=<your team> scripts/release/ios.sh ipa adhoc` |
| Paid program | The App Store | Same `ipa appstore` file, submitted for review |

Without a paid account, the only way for someone else to run it is to build it themselves from the repo in Xcode with their own free Apple ID.

Add `--no-ai` to any of them to leave the token out, and set `SHARE_APPCHECK_TOKEN` otherwise (register it for the **iOS** app in the console).

Tested so far: the Android script, end to end with a throwaway key (it made a correctly signed APK and bundle with no token inside). The iOS script's three modes are written but not run yet: `device` uses the same build-and-install steps as the development builds, but in Release configuration, and the `ipa` modes need a paid team.

## 5. Before you share, check

- [ ] You've used the app yourself on web, iPhone, iPad and Android.
- [ ] A dedicated token exists, is registered for each app, and quotas and a budget alert are set.
- [ ] `release/` and `~/.improved-notes/` are not in git (they're ignored) and the key folder is backed up.
- [ ] You know the date you'll revoke the token.
- [ ] Say in your message what the app is, that AI needs internet, and that guests last one session until they sign in.
