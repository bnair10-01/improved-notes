import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  getDocsFromCache,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { listAll, ref as storageRef, deleteObject, type StorageReference } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import { useAuth } from "./auth";
import { commit, newId, noteVersions, nowIso, requireUid, userCol, userDoc } from "./db";
import { EDITOR_ID } from "./conflict";
import { linkFirstMention, parseWikilinks, renameWikilinks } from "./wikilinks";
import { pairKey, relatedPairs } from "./related";

export type NoteKind = "handwritten" | "text" | "concept" | "generated" | "slides" | "audio" | "model3d";
export type VNote = {
  id: string; title: string; markdown: string; kind: string; folder_id: string | null;
  tags: string[]; pinned: boolean; deleted_at: string | null; updated_at: string; created_at: string; source_note_ids: string[];
  rev?: number; last_editor?: string | null;
  /** Pen strokes (JSON), see lib/ink.ts */
  ink?: string;
};
export type VFolder = { id: string; name: string; parent_id: string | null };
export type VLink = { id: string; from_note_id: string; to_note_id: string; kind: string; label: string | null };
export type Vault = { notes: VNote[]; folders: VFolder[]; links: VLink[] };

const rows = <T>(s: QuerySnapshot<DocumentData>) => s.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T);
const byUpdated = (a: VNote, b: VNote) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0);

function build(n: QuerySnapshot<DocumentData>, f: QuerySnapshot<DocumentData>, l: QuerySnapshot<DocumentData>): Vault {
  return {
    notes: rows<VNote>(n).sort(byUpdated),
    folders: rows<VFolder>(f).sort((a, b) => a.name.localeCompare(b.name)),
    links: rows<VLink>(l),
  };
}

const empty: Vault = { notes: [], folders: [], links: [] };

/** One-shot read, used by code that needs the freshest vault right now. */
export async function loadVault(): Promise<Vault> {
  if (!auth.currentUser) return empty;
  const [n, f, l] = await Promise.all([getDocs(userCol("notes")), getDocs(userCol("folders")), getDocs(userCol("links"))]);
  return build(n, f, l);
}
/**
 * Open fast: read the copy already stored on this device first (the live listeners then bring it up to date), and only go to the
 * server when there's no local copy yet, as on a first sign-in on a new device. Signing back in no longer waits on the network.
 */
async function loadVaultFast(): Promise<Vault> {
  if (!auth.currentUser) return empty;
  try {
    const [n, f, l] = await Promise.all([getDocsFromCache(userCol("notes")), getDocsFromCache(userCol("folders")), getDocsFromCache(userCol("links"))]);
    if (!n.empty || !f.empty || !l.empty) return build(n, f, l);
  } catch { /* no local copy yet */ }
  return loadVault();
}
export const vaultQuery = queryOptions({ queryKey: ["vault"], queryFn: loadVaultFast });

/**
 * The vault, kept live: Firestore snapshot listeners push every change (from this device or
 * any other signed in to the same account) straight into the query cache.
 */
export function useVault() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const snaps: Partial<Record<"n" | "f" | "l", QuerySnapshot<DocumentData>>> = {};
    const push = () => {
      if (snaps.n && snaps.f && snaps.l) qc.setQueryData(["vault"], build(snaps.n, snaps.f, snaps.l));
    };
    const stops = (["notes", "folders", "links"] as const).map((name) =>
      onSnapshot(userCol(name, uid), { includeMetadataChanges: true }, (s) => {
        snaps[name === "notes" ? "n" : name === "folders" ? "f" : "l"] = s;
        push();
      }, (e) => console.warn(`Vault listener (${name}) failed`, e)),
    );
    return () => stops.forEach((s) => s());
  }, [uid, qc]);
  return useQuery({ ...vaultQuery, queryKey: ["vault"], enabled: !!uid, staleTime: Infinity });
}

/** Listeners keep the vault current; this only forces a re-read if one is ever needed. */
export function useRefreshVault() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["vault"] });
}

const live = (v: Vault) => v.notes.filter((n) => !n.deleted_at);
export const findByTitle = (v: Vault, t: string) => live(v).find((n) => n.title.trim().toLowerCase() === t.trim().toLowerCase());

export async function createNote(fields: { title?: string; kind?: NoteKind; folder_id?: string | null; markdown?: string }) {
  const id = newId();
  const now = nowIso();
  await commit(setDoc(userDoc("notes", id), {
    title: fields.title || "Untitled", kind: fields.kind ?? "text", folder_id: fields.folder_id ?? null,
    markdown: fields.markdown ?? "", tags: [], pinned: false, deleted_at: null, source_note_ids: [],
    created_at: now, updated_at: now, rev: 1,
  }));
  return id;
}

/** Version history: at most one snapshot per 5 minutes while editing, always before a forced one. */
const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;
const lastSnapshot = new Map<string, number>();

export async function snapshotVersion(noteId: string, title: string, markdown: string, reason = "autosave", force = false) {
  const last = lastSnapshot.get(noteId) ?? 0;
  if (!force && Date.now() - last < SNAPSHOT_EVERY_MS) return;
  if (!markdown.trim()) return;
  lastSnapshot.set(noteId, Date.now());
  await commit(addDoc(noteVersions(noteId), { title, markdown, reason, created_at: nowIso() }));
}

export type NoteVersion = { id: string; title: string; markdown: string; reason: string; created_at: string };
export async function listVersions(noteId: string): Promise<NoteVersion[]> {
  const snap = await getDocs(query(noteVersions(noteId), orderBy("created_at", "desc"), limit(50)));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<NoteVersion, "id">), id: d.id }));
}

export async function restoreVersion(noteId: string, v: NoteVersion, current: { title: string; markdown: string }) {
  // Keep what's there now, so a restore is itself undoable.
  await snapshotVersion(noteId, current.title, current.markdown, "before-restore", true);
  await updateNote(noteId, { title: v.title, markdown: v.markdown });
}

export async function updateNote(id: string, patch: Partial<Pick<VNote, "title" | "markdown" | "folder_id" | "tags" | "pinned" | "deleted_at" | "ink">>) {
  await commit(updateDoc(userDoc("notes", id), { ...patch, updated_at: nowIso(), rev: increment(1), last_editor: EDITOR_ID }));
  if (patch.markdown !== undefined) {
    snapshotVersion(id, patch.title ?? "", patch.markdown).catch((e) => console.warn("Version snapshot failed", e));
  }
}

/** Make links (kind wikilink) match the [[links]] in the markdown; create notes for missing titles. */
export async function syncWikilinks(v: Vault, noteId: string, md: string) {
  const targets: string[] = [];
  for (const t of parseWikilinks(md)) {
    const hit = findByTitle(v, t);
    targets.push(hit ? hit.id : await createNote({ title: t, kind: "text" }));
  }
  const want = new Set(targets.filter((t) => t !== noteId));
  const have = v.links.filter((l) => l.from_note_id === noteId && l.kind === "wikilink");
  const drop = have.filter((l) => !want.has(l.to_note_id)).map((l) => l.id);
  const haveTo = new Set(have.map((l) => l.to_note_id));
  const add = [...want].filter((t) => !haveTo.has(t));
  if (!drop.length && !add.length) return;
  const batch = writeBatch(db);
  for (const id of drop) batch.delete(userDoc("links", id));
  for (const to of add) batch.set(userDoc("links", newId()), { from_note_id: noteId, to_note_id: to, kind: "wikilink", label: null, created_at: nowIso() });
  await commit(batch.commit());
}

/** Rename and rewrite [[Old]] → [[New]] in every note that links to it. */
export async function renameNote(v: Vault, id: string, oldTitle: string, newTitle: string) {
  await updateNote(id, { title: newTitle });
  if (!oldTitle.trim() || oldTitle === newTitle) return;
  for (const n of v.notes) {
    if (n.id === id) continue;
    const next = renameWikilinks(n.markdown, oldTitle, newTitle);
    if (next !== n.markdown) await updateNote(n.id, { markdown: next });
  }
}

export async function linkMention(note: VNote, title: string) {
  await updateNote(note.id, { markdown: linkFirstMention(note.markdown, title) });
}

/**
 * Delete a note forever. Only possible for notes already in Trash (also enforced by the
 * security rules), and its version history and links go with it.
 */
export async function purgeNote(id: string) {
  const uid = requireUid();
  const batch = writeBatch(db);
  const versions = await getDocs(noteVersions(id, uid));
  versions.docs.forEach((d) => batch.delete(d.ref));
  const [a, b] = await Promise.all([
    getDocs(query(userCol("links", uid), where("from_note_id", "==", id))),
    getDocs(query(userCol("links", uid), where("to_note_id", "==", id))),
  ]);
  [...a.docs, ...b.docs].forEach((d) => batch.delete(d.ref));
  batch.delete(userDoc("notes", id, uid));
  await commit(batch.commit());
}

export async function addLink(from: string, to: string, kind: "manual" | "ai_suggested" | "auto" = "manual", label?: string) {
  if (from === to) return;
  await commit(setDoc(userDoc("links", newId()), { from_note_id: from, to_note_id: to, kind, label: label ?? null, created_at: nowIso() }));
}
export async function deleteLink(id: string) {
  await commit(deleteDoc(userDoc("links", id)));
}

export async function createFolder(name: string, parent_id: string | null = null): Promise<string> {
  const id = newId();
  await commit(setDoc(userDoc("folders", id), { name, parent_id, created_at: nowIso() }));
  return id;
}
export async function renameFolder(id: string, name: string) {
  await commit(updateDoc(userDoc("folders", id), { name }));
}
export async function deleteFolder(id: string) {
  // Notes in the folder are moved out, never deleted along with it.
  const inside = await getDocs(query(userCol("notes"), where("folder_id", "==", id)));
  const batch = writeBatch(db);
  inside.docs.forEach((d) => batch.update(d.ref, { folder_id: null }));
  batch.delete(userDoc("folders", id));
  await commit(batch.commit());
}

/** Apply `fn` to documents in batches under Firestore's 500-write limit. */
async function inBatches<T>(items: T[], fn: (batch: ReturnType<typeof writeBatch>, item: T) => void, size = 400) {
  for (let i = 0; i < items.length; i += size) {
    const batch = writeBatch(db);
    items.slice(i, i + size).forEach((it) => fn(batch, it));
    await commit(batch.commit());
  }
}

/** Move every note in a topic to Trash (nothing is lost; Trash keeps them until it's emptied). */
export async function trashNotesIn(folderId: string) {
  const inside = await getDocs(query(userCol("notes"), where("folder_id", "==", folderId)));
  const now = nowIso();
  await inBatches(inside.docs.filter((d) => !d.get("deleted_at")), (b, d) => b.update(d.ref, { deleted_at: now, updated_at: now }));
}

/** Delete a topic and, when asked, move the notes in it to Trash first. Without that, its notes are kept and simply leave the topic. */
export async function removeTopic(folderId: string, withNotes: boolean) {
  if (withNotes) await trashNotesIn(folderId);
  await deleteFolder(folderId);
}

/** Move every note to Trash in one go. Recoverable: Trash keeps them until it's emptied. */
export async function trashAllNotes(): Promise<string[]> {
  const all = await getDocs(userCol("notes"));
  const live = all.docs.filter((d) => !d.get("deleted_at"));
  const now = nowIso();
  await inBatches(live, (b, d) => b.update(d.ref, { deleted_at: now, updated_at: now }));
  return live.map((d) => d.id);
}

/** Bring notes back from Trash (used by Undo). */
export async function restoreNotes(ids: string[]) {
  const now = nowIso();
  await inBatches(ids, (b, id) => b.update(userDoc("notes", id), { deleted_at: null, updated_at: now }));
}

async function listFiles(dir: StorageReference): Promise<StorageReference[]> {
  const res = await listAll(dir);
  const nested = await Promise.all(res.prefixes.map(listFiles));
  return [...res.items, ...nested.flat()];
}

/**
 * Erase everything this account has stored, for good: notes (through Trash, as the security rules require) with their
 * history and links, topics, study cards, quizzes and results, attachments, share links and uploaded files.
 * The account itself, and its sign-in, stay. Cannot be undone.
 */
export async function eraseEverything(): Promise<void> {
  const uid = requireUid();
  await trashAllNotes();
  const notes = await getDocs(userCol("notes"));
  const pool = [...notes.docs];
  await Promise.all(Array.from({ length: 4 }, async () => { for (let d = pool.pop(); d; d = pool.pop()) await purgeNote(d.id); }));
  for (const name of ["folders", "links", "flashcards", "quizzes", "attempts", "attachments"] as const) {
    const docs = await getDocs(userCol(name));
    await inBatches(docs.docs, (b, d) => b.delete(d.ref));
  }
  const shares = await getDocs(query(collection(db, "shares"), where("user_id", "==", uid)));
  await inBatches(shares.docs, (b, d) => b.delete(d.ref));
  await listFiles(storageRef(storage, `users/${uid}`)).then((files) => Promise.all(files.map((f) => deleteObject(f).catch(() => undefined)))).catch(() => undefined);
}

/** Notes within `depth` hops of `id` (links are treated as undirected). */
/**
 * The notes within `depth` steps of one note. Connections are the links you wrote plus, unless turned off, the ones found
 * automatically from what notes say, so a note joins its neighbours even before anyone has linked it by hand.
 */
export function neighborhood(v: Vault, id: string, depth: number, opts: { auto?: boolean } = {}): Set<string> {
  const edges: [string, string][] = v.links.map((l) => [l.from_note_id, l.to_note_id]);
  if (opts.auto ?? true) {
    const written = new Set(v.links.map((l) => pairKey(l.from_note_id, l.to_note_id)));
    for (const r of relatedPairs(v.notes.filter((n) => !n.deleted_at), { skip: written, perNote: 4 })) edges.push([r.a, r.b]);
  }
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const [x, y] of edges) {
      for (const [a, b] of [[x, y], [y, x]] as const) {
        if (frontier.includes(a) && !seen.has(b)) { seen.add(b); next.push(b); }
      }
    }
    frontier = next;
  }
  return seen;
}

export function openTarget(n: Pick<VNote, "id" | "kind">) {
  return n.kind === "handwritten" ? ({ to: "/review", search: { id: n.id } } as const) : ({ to: "/vault/$noteId", params: { noteId: n.id } } as const);
}
