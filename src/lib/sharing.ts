import { useQuery } from "@tanstack/react-query";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth";
import { db } from "./firebase";
import { commit, nowIso, requireUid, userDoc } from "./db";

/**
 * Share links are read-only and live. A link is shares/{token} → {user_id, note_id, enabled};
 * the note carries the same `shared_token`, and the security rules let anyone read a note
 * only while a matching share is enabled. Turning a link off takes effect immediately.
 */
export type ShareLink = { token: string; note_id: string; enabled: boolean };
const shares = () => collection(db, "shares");

export function useShareLinks() {
  const { user, ready } = useAuth();
  return useQuery({
    queryKey: ["share-links", user?.uid], enabled: ready && !!user && !user.isAnonymous,
    queryFn: async (): Promise<ShareLink[]> => {
      if (!user) throw new Error("Please sign in.");
      const snap = await getDocs(query(shares(), where("user_id", "==", user.uid)));
      return snap.docs.map((d) => ({ token: d.id, note_id: d.get("note_id"), enabled: d.get("enabled") === true }));
    },
  });
}

export async function setShareEnabled(token: string, enabled: boolean) {
  await commit(updateDoc(doc(db, "shares", token), { enabled, updated_at: nowIso() }));
  return { token };
}

export async function createShareLink(noteId: string): Promise<string> {
  const uid = requireUid();
  const existing = await getDocs(query(shares(), where("user_id", "==", uid), where("note_id", "==", noteId)));
  const found = existing.docs[0];
  if (found) {
    await setShareEnabled(found.id, true);
    await commit(updateDoc(userDoc("notes", noteId), { shared_token: found.id }));
    return found.id;
  }
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  await commit(setDoc(doc(db, "shares", token), { user_id: uid, note_id: noteId, enabled: true, created_at: nowIso(), updated_at: nowIso() }));
  await commit(updateDoc(userDoc("notes", noteId), { shared_token: token }));
  return token;
}

/** What a person with the link sees. Works signed out. */
export async function getSharedNote(token: string): Promise<{ title: string; markdown: string } | null> {
  const share = await getDoc(doc(db, "shares", token));
  if (!share.exists() || share.get("enabled") !== true) return null;
  const note = await getDoc(doc(db, "users", share.get("user_id"), "notes", share.get("note_id")));
  if (!note.exists() || note.get("deleted_at")) return null;
  return { title: note.get("title") ?? "", markdown: note.get("markdown") ?? "" };
}
