import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  addDoc,
  deleteDoc,
  getDocs,
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
import { auth, db } from "./firebase";
import { useAuth } from "./auth";
import { commit, newId, noteVersions, nowIso, requireUid, userCol, userDoc } from "./db";
import { EDITOR_ID } from "./conflict";
import { linkFirstMention, parseWikilinks, renameWikilinks } from "./wikilinks";

export type NoteKind = "handwritten" | "text" | "concept" | "generated" | "slides" | "audio" | "model3d";
export type VNote = {
  id: string; title: string; markdown: string; kind: string; folder_id: string | null;
  tags: string[]; pinned: boolean; deleted_at: string | null; updated_at: string; created_at: string; source_note_ids: string[];
  rev?: number; last_editor?: string | null;
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
export const vaultQuery = queryOptions({ queryKey: ["vault"], queryFn: loadVault });

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

export async function updateNote(id: string, patch: Partial<Pick<VNote, "title" | "markdown" | "folder_id" | "tags" | "pinned" | "deleted_at">>) {
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

export async function addLink(from: string, to: string, kind: "manual" | "ai_suggested" = "manual", label?: string) {
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

/** Notes within `depth` hops of `id` (links are treated as undirected). */
export function neighborhood(v: Vault, id: string, depth: number): Set<string> {
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const l of v.links) {
      for (const [a, b] of [[l.from_note_id, l.to_note_id], [l.to_note_id, l.from_note_id]] as const) {
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
