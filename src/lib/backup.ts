import JSZip from "jszip";
import { doc, getDocs, writeBatch } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { commit, noteVersions, requireUid, userCol, userDoc, type Coll } from "./db";
import { buildExportEntries } from "./export";

/**
 * A complete, self-contained copy of one person's data that they own:
 *   manifest.json            what this is and what's in it
 *   data/<collection>.json   every document (notes incl. Trash, folders, links, study cards...)
 *   versions/<noteId>.json   each note's version history
 *   files/...                photos, audio, slides and models
 *   notes/...                readable Markdown, in folders
 * Restoring it into any account adds what's missing and never overwrites anything.
 */
export const BACKUP_FORMAT = 1;
const COLLECTIONS: Coll[] = ["notes", "folders", "links", "flashcards", "quizzes", "attempts", "attachments", "settings"];

type Doc = { id: string } & Record<string, unknown>;
export type BackupManifest = { app: "improved-notes"; format: number; exported_at: string; counts: Record<string, number> };
export type RestoreSummary = { added: number; skipped: number; files: number; versions: number };

const relPath = (p: string) => p.replace(/^users\/[^/]+\//, "");
const filesIn = (d: Record<string, unknown>): string[] => [
  ...(Array.isArray(d["image_paths"]) ? (d["image_paths"] as string[]) : []),
  ...(typeof d["storage_path"] === "string" ? [d["storage_path"] as string] : []),
];

export async function buildBackup(onProgress?: (msg: string) => void): Promise<Uint8Array> {
  const uid = requireUid();
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  const data: Record<string, Doc[]> = {};

  for (const col of COLLECTIONS) {
    onProgress?.(`Reading ${col}…`);
    const snap = await getDocs(userCol(col, uid));
    data[col] = snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
    counts[col] = data[col]!.length;
    zip.file(`data/${col}.json`, JSON.stringify(data[col], null, 2));
  }

  let versionCount = 0;
  for (const n of data["notes"]!) {
    const vs = await getDocs(noteVersions(n.id, uid));
    if (!vs.size) continue;
    versionCount += vs.size;
    zip.file(`versions/${n.id}.json`, JSON.stringify(vs.docs.map((d) => ({ ...d.data(), id: d.id })), null, 2));
  }
  counts["versions"] = versionCount;

  const paths = new Set(Object.values(data).flat().flatMap(filesIn).filter((p) => p.startsWith(`users/${uid}/`)));
  let missing = 0;
  for (const p of paths) {
    onProgress?.(`Saving files (${[...paths].indexOf(p) + 1} of ${paths.size})…`);
    try { zip.file(`files/${relPath(p)}`, await getBytes(ref(storage, p))); } catch { missing++; }
  }
  counts["files"] = paths.size - missing;

  const live = (data["notes"] as unknown as Parameters<typeof buildExportEntries>[0]).filter((n) => !n.deleted_at);
  for (const e of buildExportEntries(live, data["folders"] as unknown as Parameters<typeof buildExportEntries>[1])) zip.file(`notes/${e.path}`, e.markdown);

  const manifest: BackupManifest = { app: "improved-notes", format: BACKUP_FORMAT, exported_at: new Date().toISOString(), counts };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  onProgress?.("Packing…");
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function readManifest(zipBytes: Uint8Array | ArrayBuffer | Blob): Promise<BackupManifest> {
  const zip = await JSZip.loadAsync(zipBytes);
  const raw = await zip.file("manifest.json")?.async("string");
  if (!raw) throw new Error("This isn't an Improved Notes backup.");
  const m = JSON.parse(raw) as BackupManifest;
  if (m.app !== "improved-notes") throw new Error("This isn't an Improved Notes backup.");
  if (m.format > BACKUP_FORMAT) throw new Error("This backup was made by a newer version of the app. Update and try again.");
  return m;
}

export async function restoreBackup(zipBytes: Uint8Array | ArrayBuffer | Blob, onProgress?: (msg: string) => void): Promise<RestoreSummary> {
  const uid = requireUid();
  await readManifest(zipBytes);
  const zip = await JSZip.loadAsync(zipBytes);
  const summary: RestoreSummary = { added: 0, skipped: 0, files: 0, versions: 0 };
  const read = async <T>(path: string): Promise<T | null> => {
    const raw = await zip.file(path)?.async("string");
    return raw ? (JSON.parse(raw) as T) : null;
  };

  // Files first, so documents never point at something that isn't there yet.
  const fileEntries = Object.keys(zip.files).filter((p) => p.startsWith("files/") && !zip.files[p]!.dir);
  for (const [i, p] of fileEntries.entries()) {
    onProgress?.(`Restoring files (${i + 1} of ${fileEntries.length})…`);
    await uploadBytes(ref(storage, `users/${uid}/${p.slice("files/".length)}`), await zip.file(p)!.async("uint8array"));
    summary.files++;
  }
  const remap = (p: string) => `users/${uid}/${relPath(p)}`;

  for (const col of COLLECTIONS) {
    const docs = (await read<Doc[]>(`data/${col}.json`)) ?? [];
    onProgress?.(`Restoring ${col}…`);
    const existing = new Set((await getDocs(userCol(col, uid))).docs.map((d) => d.id));
    for (let i = 0; i < docs.length; i += 200) {
      const batch = writeBatch(db);
      let any = false;
      for (const { id, ...d } of docs.slice(i, i + 200)) {
        if (existing.has(id)) { summary.skipped++; continue; } // never overwrite
        if (Array.isArray(d["image_paths"])) d["image_paths"] = (d["image_paths"] as string[]).map(remap);
        if (typeof d["storage_path"] === "string") d["storage_path"] = remap(d["storage_path"] as string);
        batch.set(userDoc(col, id, uid), d);
        summary.added++; any = true;
      }
      if (any) await commit(batch.commit(), 30_000);
    }
  }

  for (const p of Object.keys(zip.files).filter((f) => f.startsWith("versions/") && f.endsWith(".json"))) {
    const noteId = p.slice("versions/".length, -".json".length);
    const have = new Set((await getDocs(noteVersions(noteId, uid))).docs.map((d) => d.id));
    const versions = (await read<Doc[]>(p)) ?? [];
    const batch = writeBatch(db);
    let any = false;
    for (const { id, ...v } of versions) {
      if (have.has(id)) continue;
      batch.set(userDocVersion(noteId, id, uid), v);
      summary.versions++; any = true;
    }
    if (any) await commit(batch.commit(), 30_000);
  }
  return summary;
}

const userDocVersion = (noteId: string, id: string, uid: string) => doc(db, "users", uid, "notes", noteId, "versions", id);
