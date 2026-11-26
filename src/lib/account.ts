import { doc, getDocs, writeBatch, collection } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

const SUBCOLLECTIONS = ["notes", "folders", "links", "flashcards", "quizzes", "attempts", "attachments"] as const;

/** Copy a Storage object to the new owner's folder. Returns the new path (or the old one if it can't be read). */
async function copyFile(path: string, from: string, to: string): Promise<string> {
  if (!path.startsWith(`users/${from}/`)) return path;
  const next = path.replace(`users/${from}/`, `users/${to}/`);
  try {
    const bytes = await getBytes(ref(storage, path));
    await uploadBytes(ref(storage, next), bytes);
    return next;
  } catch {
    return path;
  }
}

/**
 * When a guest signs in to an account that already exists, their guest notes would be left behind.
 * Copy everything (documents and files) into the existing account so nothing is lost.
 * The guest copy is left in place; nothing is deleted here.
 */
export async function migrateAccountData(fromUid: string, toUid: string): Promise<number> {
  let copied = 0;
  for (const name of SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, "users", fromUid, name));
    for (let i = 0; i < snap.docs.length; i += 200) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 200)) {
        const data = { ...d.data() } as Record<string, unknown>;
        if (Array.isArray(data["image_paths"])) {
          data["image_paths"] = await Promise.all((data["image_paths"] as string[]).map((p) => copyFile(p, fromUid, toUid)));
        }
        if (typeof data["storage_path"] === "string") {
          data["storage_path"] = await copyFile(data["storage_path"] as string, fromUid, toUid);
        }
        batch.set(doc(db, "users", toUid, name, d.id), data, { merge: false });
        copied++;
      }
      await batch.commit();
    }
  }
  return copied;
}
