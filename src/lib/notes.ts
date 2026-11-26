import { deleteDoc, increment, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { enqueueUpload, isNetworkError, pendingBlob, type PendingUpload } from "./upload-queue";
import { storage } from "./firebase";
import { EDITOR_ID } from "./conflict";
import { commit, newId, nowIso, requireUid, userDoc } from "./db";
import { dataUrlToBlob } from "./image";
import type { MindMap } from "./mindmap-types";
import type { Diagram } from "./diagram-types";
import type { Page, TranscriptResult } from "./types";

/** Download URLs for stored files. A file still waiting to upload is shown from the device. */
export async function signedUrls(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map(async (p) => {
    const local = await pendingBlob(p);
    if (local) return URL.createObjectURL(local);
    return getDownloadURL(ref(storage, p)).catch(() => "");
  }));
}

/** Send a queued file to Storage (used by the queue when the connection returns). */
export async function uploadPending(item: PendingUpload) {
  await uploadBytes(ref(storage, item.path), item.blob, { contentType: item.contentType });
}

/**
 * Upload a file. If the network is down it is kept on the device and sent later, so saving
 * never fails or loses the file because of a bad connection. Real errors (permissions, bad
 * data) are still thrown.
 */
export async function uploadFile(path: string, body: Blob | Uint8Array | ArrayBuffer, contentType: string) {
  const blob = body instanceof Blob ? body : new Blob([body as BlobPart], { type: contentType });
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
    await uploadBytes(ref(storage, path), blob, { contentType });
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueueUpload(path, blob, contentType);
  }
}

export async function saveNote(
  noteId: string | null,
  pages: Page[],
  result: TranscriptResult,
  mindmap: MindMap | null = null,
  mindmapStale = false,
  diagrams: Diagram[] = [],
): Promise<string> {
  const uid = requireUid("Please sign in to save notes.");
  const id = noteId ?? newId();
  const paths: string[] = [];
  for (const [i, p] of pages.entries()) {
    if (p.path) { paths.push(p.path); continue; }
    const path = `users/${uid}/images/${id}/page-${i + 1}-${newId().slice(0, 8)}.jpg`;
    await uploadFile(path, dataUrlToBlob(p.dataUrl), "image/jpeg");
    p.path = path;
    paths.push(path);
  }
  const fields = {
    title: result.title,
    markdown: result.markdown,
    structure: mindmap ?? result.structure,
    mindmap_stale: mindmapStale,
    diagrams,
    image_paths: paths,
    updated_at: nowIso(),
  };
  if (noteId) {
    await commit(updateDoc(userDoc("notes", id), { ...fields, rev: increment(1), last_editor: EDITOR_ID }));
    return id;
  }
  await commit(setDoc(userDoc("notes", id), {
    ...fields,
    kind: "handwritten",
    folder_id: null,
    tags: [],
    pinned: false,
    deleted_at: null,
    source_note_ids: [],
    created_at: nowIso(),
    rev: 1,
  }));
  return id;
}

/** Nothing is deleted silently: "delete" moves a note to Trash, where it stays until the person empties it. */
export async function trashNote(id: string) {
  await commit(updateDoc(userDoc("notes", id), { deleted_at: nowIso(), updated_at: nowIso() }));
}

export async function restoreNote(id: string) {
  await commit(updateDoc(userDoc("notes", id), { deleted_at: null, updated_at: nowIso() }));
}

export async function saveMindmap(noteId: string, mindmap: MindMap | null, stale: boolean) {
  const patch: Record<string, unknown> = { mindmap_stale: stale, updated_at: nowIso() };
  if (mindmap) patch["structure"] = mindmap;
  await commit(updateDoc(userDoc("notes", noteId), patch));
}

export async function saveDiagrams(noteId: string, diagrams: Diagram[]) {
  await commit(updateDoc(userDoc("notes", noteId), { diagrams, updated_at: nowIso() }));
}

/** Permanent delete. Security rules only allow this for notes already in Trash. */
export async function deleteNoteForever(id: string) {
  await commit(deleteDoc(userDoc("notes", id)));
}
