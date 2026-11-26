/**
 * Detecting edits made on another device. Every write is tagged with the id of the editor
 * (browser tab / app window) that made it, so an editor can tell its own saves coming back
 * from the server apart from changes made elsewhere.
 */
export const EDITOR_ID: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);

export type RemoteChange =
  /** Nothing new. */
  | "none"
  /** The change is our own save echoing back: just move our baseline forward. */
  | "own"
  /** Someone else changed it and we have no unsaved edits: take their version silently. */
  | "apply"
  /** Someone else changed it while we have unsaved edits: ask the person. */
  | "conflict";

export function classifyRemote(p: {
  remoteRev: number;
  remoteEditor: string | null | undefined;
  baseRev: number;
  dirty: boolean;
  editorId?: string;
}): RemoteChange {
  if (p.remoteRev <= p.baseRev) return "none";
  if (p.remoteEditor && p.remoteEditor === (p.editorId ?? EDITOR_ID)) return "own";
  return p.dirty ? "conflict" : "apply";
}

/** "Keep both": the local text is saved as its own note so nothing is overwritten. */
export function conflictCopyTitle(title: string, now = new Date()): string {
  return `${title || "Untitled"} (conflict copy ${now.toISOString().slice(0, 16).replace("T", " ")})`;
}
