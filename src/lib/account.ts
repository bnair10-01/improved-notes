import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

const COLLECTIONS = ["notes", "folders", "links", "flashcards", "quizzes", "attempts", "attachments"] as const;
type Row = { col: string; id: string; data: Record<string, unknown> };

/** Everything a guest made: documents and the files they point at. */
export type GuestData = { fromUid: string; rows: Row[]; files: Map<string, Uint8Array> };

const pathsOf = (data: Record<string, unknown>): string[] => [
  ...(Array.isArray(data["image_paths"]) ? (data["image_paths"] as string[]) : []),
  ...(typeof data["storage_path"] === "string" ? [data["storage_path"] as string] : []),
];

/**
 * Step 1: read the guest's data. This MUST run while still signed in as the guest,
 * because the security rules only let people read their own data.
 */
export async function captureGuestData(fromUid: string): Promise<GuestData> {
  const rows: Row[] = [];
  for (const col of COLLECTIONS) {
    const snap = await getDocs(collection(db, "users", fromUid, col));
    snap.docs.forEach((d) => rows.push({ col, id: d.id, data: d.data() as Record<string, unknown> }));
  }
  const files = new Map<string, Uint8Array>();
  for (const path of new Set(rows.flatMap((r) => pathsOf(r.data)))) {
    if (!path.startsWith(`users/${fromUid}/`)) continue;
    try { files.set(path, new Uint8Array(await getBytes(ref(storage, path)))); } catch { /* keep the old path; never fail the sign-in */ }
  }
  return { fromUid, rows, files };
}

/**
 * Step 2: after signing in to the existing account, write the guest's data into it.
 * Nothing is deleted: the guest copy stays where it is. Existing documents are never overwritten.
 */
export async function restoreGuestData(guest: GuestData, toUid: string): Promise<number> {
  const moved = new Map<string, string>();
  for (const [path, bytes] of guest.files) {
    const next = path.replace(`users/${guest.fromUid}/`, `users/${toUid}/`);
    try { await uploadBytes(ref(storage, next), bytes); moved.set(path, next); } catch { /* leave the path as it was */ }
  }
  const remap = (p: string) => moved.get(p) ?? p;
  let copied = 0;
  for (let i = 0; i < guest.rows.length; i += 200) {
    const batch = writeBatch(db);
    for (const r of guest.rows.slice(i, i + 200)) {
      const data = { ...r.data };
      if (Array.isArray(data["image_paths"])) data["image_paths"] = (data["image_paths"] as string[]).map(remap);
      if (typeof data["storage_path"] === "string") data["storage_path"] = remap(data["storage_path"] as string);
      batch.set(doc(db, "users", toUid, r.col, r.id), data);
      copied++;
    }
    await batch.commit();
  }
  return copied;
}

/** Convenience for callers that need to sign in between capture and restore. */
export async function carryGuestData<T>(fromUid: string, signIn: () => Promise<{ uid: string } & T>): Promise<{ uid: string } & T> {
  const guest = await captureGuestData(fromUid).catch(() => null);
  const user = await signIn();
  if (guest && guest.rows.length && user.uid !== fromUid) await restoreGuestData(guest, user.uid);
  return user;
}
