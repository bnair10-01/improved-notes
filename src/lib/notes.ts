import { deleteDoc, increment, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { EDITOR_ID } from "./conflict";
import { commit, newId, nowIso, requireUid, userDoc } from "./db";
import { dataUrlToBlob } from "./image";
import type { MindMap } from "./mindmap-types";
import type { Diagram } from "./diagram-types";
import type { Page, TranscriptResult } from "./types";

/** Short-lived-style download URLs for files in the signed-in person's storage folder. */
export async function signedUrls(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map((p) => getDownloadURL(ref(storage, p)).catch(() => "")));
}

export async function uploadFile(path: string, body: Blob | Uint8Array | ArrayBuffer, contentType: string) {
  await uploadBytes(ref(storage, path), body, { contentType });
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
