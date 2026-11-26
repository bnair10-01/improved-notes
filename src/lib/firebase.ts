import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

const env = import.meta.env;

/** Emulator mode lets the whole app run and be tested without a Firebase project. */
export const USE_EMULATORS = env.VITE_USE_EMULATORS === "true";

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "demo-improved-notes.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-improved-notes",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "demo-improved-notes.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: env.VITE_FIREBASE_APP_ID || "1:0:web:demo",
};

export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY) || USE_EMULATORS;

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);

export const auth: Auth = getAuth(app);

// Offline-first: a full local replica, shared across tabs, so notes stay readable
// and editable without a connection and sync when it returns.
export const db: Firestore = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialised (hot reload) or persistence unavailable: reuse / fall back to memory cache.
    return initializeFirestore(app, {});
  }
})();

export const storage: FirebaseStorage = getStorage(app);

let appCheck: AppCheck | null = null;
function startAppCheck() {
  if (USE_EMULATORS || typeof window === "undefined") return;
  const debug = env.VITE_APPCHECK_DEBUG_TOKEN;
  if (debug) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debug === "true" ? true : debug;
  }
  const siteKey = env.VITE_APPCHECK_SITE_KEY;
  if (!siteKey && !debug) return;
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey || "debug"),
    isTokenAutoRefreshEnabled: true,
  });
}

if (USE_EMULATORS) {
  const host = env.VITE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
} else {
  startAppCheck();
}

export const getAppCheck = () => appCheck;
