import { useSyncExternalStore } from "react";

/**
 * Files (photos, audio, slides) captured while offline are kept on the device and uploaded
 * when the connection returns, so a save never fails or loses a file because of the network.
 * The note itself is written to Firestore immediately (it has its own offline cache).
 */
export type PendingUpload = { path: string; blob: Blob; contentType: string; queuedAt: number; attempts: number };
export type Uploader = (item: PendingUpload) => Promise<void>;

const DB_NAME = "improved-notes-uploads";
const STORE = "pending";

// IndexedDB where it exists; a plain in-memory map otherwise (tests, private windows).
const memory = new Map<string, PendingUpload>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "path" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    if (!db) return resolve(undefined);
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

const listeners = new Set<() => void>();
let count = 0;
const notify = (n: number) => { count = n; listeners.forEach((l) => l()); };

export async function pendingUploads(): Promise<PendingUpload[]> {
  const db = await openDb();
  if (!db) return [...memory.values()].sort((a, b) => a.queuedAt - b.queuedAt);
  return ((await tx<PendingUpload[]>("readonly", (s) => s.getAll() as IDBRequest<PendingUpload[]>)) ?? []).sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function enqueueUpload(path: string, blob: Blob, contentType: string): Promise<void> {
  const item: PendingUpload = { path, blob, contentType, queuedAt: Date.now(), attempts: 0 };
  if (await openDb()) await tx("readwrite", (s) => s.put(item)); else memory.set(path, item);
  notify((await pendingUploads()).length);
}

export async function pendingBlob(path: string): Promise<Blob | null> {
  if (await openDb()) return ((await tx<PendingUpload>("readonly", (s) => s.get(path) as IDBRequest<PendingUpload>))?.blob) ?? null;
  return memory.get(path)?.blob ?? null;
}

async function remove(path: string) {
  if (await openDb()) await tx("readwrite", (s) => s.delete(path)); else memory.delete(path);
}
async function bump(item: PendingUpload) {
  const next = { ...item, attempts: item.attempts + 1 };
  if (await openDb()) await tx("readwrite", (s) => s.put(next)); else memory.set(item.path, next);
}

let flushing: Promise<{ done: number; failed: number }> | null = null;

/** Upload everything waiting, oldest first. A failure leaves that file queued for next time. */
export function flushUploads(upload: Uploader): Promise<{ done: number; failed: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let done = 0, failed = 0;
    for (const item of await pendingUploads()) {
      try { await upload(item); await remove(item.path); done++; }
      catch { await bump(item); failed++; }
    }
    notify((await pendingUploads()).length);
    return { done, failed };
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Is this error the network's fault (worth retrying later) rather than ours (permissions, bad data)? */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : "";
  return /retry-limit-exceeded|unknown|canceled/.test(code) || /network|failed to fetch|offline|timeout/i.test(msg);
}

/** How many files are waiting to upload (for a "syncing" indicator). */
export function usePendingUploads(): number {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => count, () => 0);
}

/** Call once at startup: retry on reconnect, and every minute while the app is open. */
export function startUploadQueue(upload: Uploader) {
  if (typeof window === "undefined") return () => undefined;
  const run = () => { void flushUploads(upload); };
  void pendingUploads().then((p) => notify(p.length)).then(run);
  window.addEventListener("online", run);
  const timer = setInterval(run, 60_000);
  return () => { window.removeEventListener("online", run); clearInterval(timer); };
}
