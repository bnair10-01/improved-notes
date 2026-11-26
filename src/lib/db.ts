import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type QueryConstraint,
} from "firebase/firestore";
import { auth, db } from "./firebase";

/** Per-user collections. Everything a person owns lives under users/{uid}/. */
export type Coll =
  | "notes" | "folders" | "links" | "flashcards" | "quizzes"
  | "attempts" | "attachments" | "settings" | "versions";

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function requireUid(message = "Please sign in."): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error(message);
  return uid;
}

export const userCol = (name: Coll, uid = requireUid()): CollectionReference<DocumentData> =>
  collection(db, "users", uid, name);

export const userDoc = (name: Coll, id: string, uid = requireUid()): DocumentReference<DocumentData> =>
  doc(db, "users", uid, name, id);

export const noteVersions = (noteId: string, uid = requireUid()) =>
  collection(db, "users", uid, "notes", noteId, "versions");

/** Remove undefined values (Firestore rejects them). */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export async function getRow<T = DocumentData>(name: Coll, id: string): Promise<(T & { id: string }) | null> {
  const snap = await getDoc(userDoc(name, id));
  return snap.exists() ? ({ ...(snap.data() as T), id: snap.id }) : null;
}

export async function listRows<T = DocumentData>(name: Coll, ...constraints: QueryConstraint[]): Promise<(T & { id: string })[]> {
  const snap = await getDocs(query(userCol(name), ...constraints));
  return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
}

/** Delete every doc matching a field value, in batches. */
export async function deleteWhere(name: Coll, field: string, value: unknown) {
  const snap = await getDocs(query(userCol(name), where(field, "==", value)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Await a write just long enough to surface real errors (permission denied, bad data).
 * Firestore only resolves a write once the server acknowledges it, which never happens
 * while offline, so after a short grace period we let it sync in the background.
 */
export async function commit(write: Promise<unknown>, graceMs = 1500): Promise<void> {
  let done = false;
  const guarded = write.then(() => { done = true; });
  guarded.catch((e) => { if (done) console.warn("Background sync failed", e); });
  await Promise.race([guarded, new Promise<void>((r) => setTimeout(r, graceMs))]);
}
