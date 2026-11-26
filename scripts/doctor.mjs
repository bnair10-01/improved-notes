#!/usr/bin/env node
// Checks that every Firebase product the app needs is set up and working, and says what to fix.
//
//   npm run doctor                 check the project in .env (live)
//   npm run doctor -- --emulators  check the local emulators (Auth, Firestore, Storage only)
//
// AI Logic is checked with a tiny cloud prompt. If App Check is enforced, set
// VITE_APPCHECK_DEBUG_TOKEN (register it in Firebase console > App Check > Apps > Debug tokens).
import { readFileSync, existsSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { connectStorageEmulator, deleteObject, getBytes, getStorage, ref, uploadBytes } from "firebase/storage";
import { initializeAppCheck, CustomProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";

const emu = process.argv.includes("--emulators");
const env = { ...process.env };
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && m[2] && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const results = [];
const pass = (n, d = "") => { results.push(["PASS", n, d]); console.log(`  ✔ ${n}${d ? "  " + d : ""}`); };
const fail = (n, why, fix) => { results.push(["FAIL", n, why]); console.log(`  ✘ ${n}\n      ${why}${fix ? "\n      fix: " + fix : ""}`); };
const skip = (n, why) => { results.push(["SKIP", n, why]); console.log(`  - ${n}  (${why})`); };
const smartFix = (msg, fix) =>
  /prepayment|credits? (are|is) depleted|billing/i.test(msg) ? "the Gemini API has no credit: open https://aistudio.google.com, select this project, and add credits / link a billing account (Billing)"
  : /app.?check/i.test(msg) && !/NOT protected/.test(msg) ? "App Check is rejecting the request: register a debug token (Console > App Check > Apps > Manage debug tokens) and set VITE_APPCHECK_DEBUG_TOKEN"
  : /not.found|404/i.test(msg) && /model/i.test(msg) ? "the model name isn't available: set VITE_AI_MODEL to a current model from https://firebase.google.com/docs/ai-logic/models"
  : fix;
const step = async (n, fix, fn) => { try { const d = await fn(); pass(n, d ?? ""); } catch (e) { const msg = (e?.message ?? e).toString(); fail(n, (e?.code ? e.code + ": " : "") + msg.split("\n")[0].slice(0, 220), smartFix(msg, fix)); } };

console.log(emu ? "Improved Notes doctor (emulators)\n" : "Improved Notes doctor (live project)\n");

const need = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID", "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_AUTH_DOMAIN"];
const config = emu
  ? { apiKey: "demo", projectId: "demo-improved-notes", appId: "1:0:web:doctor", storageBucket: "demo-improved-notes.appspot.com" }
  : { apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID };

if (!emu) {
  const missing = need.filter((k) => !env[k]);
  if (missing.length) { fail("Config", `missing ${missing.join(", ")}`, "copy the web app config from Firebase console > Project settings > Your apps into .env"); finish(); }
  else pass("Config", `project ${config.projectId}`);
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
storage.maxUploadRetryTime = 15000;
if (emu) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

// App Check: a debug token is exchanged for a real token, so a script can call AI Logic.
const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN;
if (!emu && debugToken) {
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => {
        const r = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${config.projectId}/apps/${config.appId}:exchangeDebugToken?key=${config.apiKey}`, {
          // limited_use: single-use tokens, which AI Logic requires once replay protection is on.
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ debug_token: debugToken, limited_use: true }),
        });
        if (!r.ok) throw new Error(`debug token rejected (${r.status}). Register it in Firebase console > App Check > Apps > Debug tokens.`);
        const j = await r.json();
        return { token: j.token, expireTimeMillis: Date.now() + parseInt(j.ttl, 10) * 1000 };
      },
    }),
    isTokenAutoRefreshEnabled: false,
  });
  await step("App Check (debug token accepted by Google)", "register the token: Console > App Check > Apps > your web app > Manage debug tokens; the app must also be registered with the reCAPTCHA Enterprise provider", async () => {
    const r = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${config.projectId}/apps/${config.appId}:exchangeDebugToken?key=${config.apiKey}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ debug_token: debugToken }),
    });
    if (!r.ok) throw new Error(`exchange failed (${r.status}): ${(await r.text()).slice(0, 160).replace(/\s+/g, " ")}`);
    return "token exchanged for an App Check token";
  });
} else if (!emu) {
  skip("App Check", "no VITE_APPCHECK_DEBUG_TOKEN; AI Logic will fail if App Check is enforced");
}

let uid = "";
await step("Authentication (anonymous guest sign-in)", "Firebase console > Authentication > Sign-in method > enable Anonymous", async () => {
  uid = (await signInAnonymously(auth)).user.uid;
  return `uid ${uid.slice(0, 8)}…`;
});

if (uid) {
  await step("Firestore (write, read, delete)", "Firebase console > Firestore Database > Create database, then deploy rules: firebase deploy --only firestore:rules", async () => {
    const d = doc(db, "users", uid, "settings", "doctor");
    await setDoc(d, { ok: true, at: new Date().toISOString() });
    if (!(await getDoc(d)).get("ok")) throw new Error("read-back mismatch");
    await deleteDoc(d);
  });
  await step("Firestore rules (cannot read another user's data)", "deploy rules: firebase deploy --only firestore:rules", async () => {
    try { await getDoc(doc(db, "users", "not-me", "notes", "x")); } catch { return "denied as expected"; }
    throw new Error("another user's path was readable; the rules are not deployed or are too open");
  });
  await step("Storage (upload, read, delete)", "Firebase console > Storage > Get started, then deploy rules: firebase deploy --only storage", async () => {
    const r = ref(storage, `users/${uid}/doctor.txt`);
    await uploadBytes(r, new TextEncoder().encode("ok"));
    if (new TextDecoder().decode(await getBytes(r)) !== "ok") throw new Error("read-back mismatch");
    await deleteObject(r);
  });
}

if (emu) {
  skip("Remote Config", "browser-only; the app falls back to built-in defaults");
  skip("AI Logic", "needs a live project");
} else {
  skip("Remote Config", "browser-only SDK; open the app and check the Network tab for firebaseremoteconfig.googleapis.com");
  await step("AI Logic (cloud model answers)", "Firebase console > AI Logic > Get started (Gemini Developer API); enable App Check and use a debug token", async () => {
    const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: !emu }), { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: env.VITE_AI_MODEL || "gemini-3.8-flash" } });
    const r = await model.generateContent("Reply with exactly: OK");
    return `model said "${r.response.text().trim().slice(0, 20)}" (ran ${r.response.inferenceSource ?? "in_cloud"})`;
  });
  // The important security check: a client with NO App Check token must be refused, otherwise
  // anyone who copies the public API key from the website can spend your AI credits.
  await step("App Check enforced (a request with no token is refused)", "Console > App Check > APIs > Firebase AI Logic > Enforce (with replay protection). Enforcement can take a few minutes.", async () => {
    const bare = initializeApp(config, "no-app-check");
    const bareModel = getGenerativeModel(getAI(bare, { backend: new GoogleAIBackend() }), { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: env.VITE_AI_MODEL || "gemini-3.8-flash" } });
    try { await bareModel.generateContent("Reply with exactly: OK"); }
    catch (e) { if (/app.?check|401|403|permission|unauthenticated/i.test(String(e?.message))) return "refused as expected"; throw e; }
    throw new Error("the model answered without any App Check token. AI Logic is NOT protected: anyone with your public API key can use your credits");
  });
  skip("On-device (Gemini Nano)", "needs Chrome with the on-device model; open the app in Chrome and check the badge");
}

finish();
function finish() {
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${failed ? `${failed} check(s) failed.` : "All checks passed."}`);
  process.exit(failed ? 1 : 0);
}
