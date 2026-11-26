import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  type Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type AuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { carryGuestData } from "./account";

const PENDING = "ink-next-path";

/** Where to send the user once a session exists (used across a full-page sign-in round trip). */
export function rememberNext(path: string) {
  try { sessionStorage.setItem(PENDING, path); } catch { /* private mode */ }
}

export function takeNext(): string | null {
  try {
    const p = sessionStorage.getItem(PENDING);
    if (p) sessionStorage.removeItem(PENDING);
    return p;
  } catch { return null; }
}

/**
 * Guests are short-lived on purpose. A guest account lives only in this browser tab (it survives a
 * reload, but not closing the tab) and is never remembered between visits. Real accounts stay signed in.
 */
const GUEST_KEY = "guest-session";
const markGuest = () => { try { sessionStorage.setItem(GUEST_KEY, "1"); } catch { /* private mode */ } };
const clearGuestMark = () => { try { sessionStorage.removeItem(GUEST_KEY); } catch { /* private mode */ } };
const isThisTabsGuest = () => { try { return sessionStorage.getItem(GUEST_KEY) === "1"; } catch { return false; } };
const isStaleGuest = (u: User | null) => !!u && u.isAnonymous && !isThisTabsGuest();

/** Sign out a guest left over from an earlier visit, so the app opens on the welcome page. */
export async function dropStaleGuest(a?: Pick<Auth, "authStateReady" | "currentUser">, out: (a: Auth) => Promise<void> = fbSignOut): Promise<void> {
  try {
    const target = a ?? auth;
    await target.authStateReady();
    if (isStaleGuest(target.currentUser)) await out(target as Auth);
  } catch { /* nothing to drop */ }
}
/** Resolves once the stored session has been checked. Wait for this before reading the current user. */
export const authSettled: Promise<void> = dropStaleGuest();

/** After a real sign-in, keep the account signed in across visits. */
async function keepSignedIn<T>(work: Promise<T>): Promise<T> {
  const result = await work;
  try { await setPersistence(auth, browserLocalPersistence); } catch { /* keep the session we have */ }
  clearGuestMark();
  return result;
}

/** Session state, kept fresh by Firebase auth events. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(isStaleGuest(auth.currentUser) ? null : auth.currentUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void authSettled.then(() => {
      if (!alive) return;
      off = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      });
    });
    return () => { alive = false; off?.(); };
  }, []);

  return { user, ready };
}

/** A signed-in person who has an email or Google identity (not just a guest session). */
export const isPermanent = (u: User | null | undefined) => !!u && !u.isAnonymous;

/**
 * Capture works before sign-in: a guest (anonymous) account is created on demand and
 * later *linked* to a real sign-in, so nothing made as a guest is lost.
 */
export async function ensureSignedIn(): Promise<User> {
  await authSettled;
  if (auth.currentUser) return auth.currentUser;
  // A guest is kept only for this tab, not saved on the device between visits.
  try { await setPersistence(auth, browserSessionPersistence); } catch { /* fall back to the default */ }
  markGuest();
  const cred = await signInAnonymously(auth);
  return cred.user;
}

function isCode(e: unknown, code: string) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === code;
}

/** Link a provider to the guest account, or sign in (carrying guest data over) if it already exists. */
function linkOrSignIn(provider: AuthProvider): Promise<User> {
  return keepSignedIn(linkOrSignInInner(provider));
}
async function linkOrSignInInner(provider: AuthProvider): Promise<User> {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  try {
    const result = guest ? await linkWithPopup(guest, provider) : await signInWithPopup(auth, provider);
    return result.user;
  } catch (e) {
    if (guest && isCode(e, "auth/credential-already-in-use")) {
      const credential =
        GoogleAuthProvider.credentialFromError(e as never);
      if (!credential) throw e;
      // Still the guest here, so their data is read first and then carried into the existing account.
      return carryGuestData(guest.uid, () => signInWithCredential(auth, credential).then((r) => r.user));
    }
    throw e;
  }
}

export const signInWithGoogle = () => linkOrSignIn(new GoogleAuthProvider());

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (guest) {
    return keepSignedIn(linkWithCredential(guest, EmailAuthProvider.credential(email, password)).then((r) => r.user));
  }
  return keepSignedIn(createUserWithEmailAndPassword(auth, email, password).then((r) => r.user));
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  const signIn = () => signInWithEmailAndPassword(auth, email, password).then((r) => r.user);
  return keepSignedIn(guest ? carryGuestData(guest.uid, signIn) : signIn());
}

/** Which sign-in methods an email already has, used to explain "account exists" errors. */
export const signInMethodsFor = (email: string) => fetchSignInMethodsForEmail(auth, email);

export const signOut = () => fbSignOut(auth);

export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "That email and password don't match.",
    "auth/wrong-password": "That email and password don't match.",
    "auth/user-not-found": "That email and password don't match.",
    "auth/email-already-in-use": "That email already has an account. Try signing in.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/account-exists-with-different-credential": "That email already uses a different sign-in method. Sign in with it, then link this one in Settings.",
    "auth/network-request-failed": "No connection. Check your network and try again.",
    "auth/operation-not-allowed": "That sign-in method isn't switched on for this app yet. Use email for now.",
    "auth/unauthorized-domain": "Sign-in isn't allowed from this web address yet.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/web-storage-unsupported": "Your browser is blocking storage, which sign-in needs. Leave private browsing or allow cookies.",
    "auth/credential-already-in-use": "That account is already linked to another profile.",
  };
  return map[code] ?? (e instanceof Error ? e.message : "Something went wrong.");
}
