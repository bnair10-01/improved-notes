import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
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

/** Session state, kept fresh by Firebase auth events. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  return { user, ready };
}

/** A signed-in person who has an email/Google/Apple identity (not just a guest session). */
export const isPermanent = (u: User | null | undefined) => !!u && !u.isAnonymous;

/**
 * Capture works before sign-in: a guest (anonymous) account is created on demand and
 * later *linked* to a real sign-in, so nothing made as a guest is lost.
 */
export async function ensureSignedIn(): Promise<User> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

function isCode(e: unknown, code: string) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === code;
}

/** Link a provider to the guest account, or sign in (carrying guest data over) if it already exists. */
async function linkOrSignIn(provider: AuthProvider): Promise<User> {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  try {
    const result = guest ? await linkWithPopup(guest, provider) : await signInWithPopup(auth, provider);
    return result.user;
  } catch (e) {
    if (guest && isCode(e, "auth/credential-already-in-use")) {
      const credential =
        GoogleAuthProvider.credentialFromError(e as never) ?? OAuthProvider.credentialFromError(e as never);
      if (!credential) throw e;
      // Still the guest here, so their data is read first and then carried into the existing account.
      return carryGuestData(guest.uid, () => signInWithCredential(auth, credential).then((r) => r.user));
    }
    throw e;
  }
}

export const signInWithGoogle = () => linkOrSignIn(new GoogleAuthProvider());
export const signInWithApple = () => {
  const p = new OAuthProvider("apple.com");
  p.addScope("email");
  p.addScope("name");
  return linkOrSignIn(p);
};

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (guest) {
    const result = await linkWithCredential(guest, EmailAuthProvider.credential(email, password));
    return result.user;
  }
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  const signIn = () => signInWithEmailAndPassword(auth, email, password).then((r) => r.user);
  return guest ? carryGuestData(guest.uid, signIn) : signIn();
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
