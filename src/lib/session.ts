import { useSyncExternalStore } from "react";
import type { Page, TranscriptResult } from "./types";
import type { MindMap } from "./mindmap-types";
import type { Diagram } from "./diagram-types";

type Session = {
  pages: Page[];
  result: TranscriptResult | null;
  noteId: string | null;
  mindmap?: MindMap | null;
  mindmapStale?: boolean;
  diagrams?: Diagram[];
  /** "text" = just the transcript; "map" = transcript + mind map + drawings. */
  mode?: "text" | "map";
};

const KEY = "cleanmap-session";

let state: Session = { pages: [], result: null, noteId: null };
const listeners = new Set<() => void>();

/**
 * Keep the in-progress note in sessionStorage so a sign-in round trip
 * (which can be a full page change) doesn't throw away the transcript.
 * Best effort: if the photos are too big for the quota, we just don't persist.
 */
function persist() {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* over quota — stay in memory */ }
}

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Session;
    if (saved && Array.isArray(saved.pages)) state = { ...state, ...saved };
  } catch { /* ignore a malformed entry */ }
}
hydrate();

export function setSession(patch: Partial<Session>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}
export function getSession() {
  return state;
}
const empty: Session = { pages: [], result: null, noteId: null };
export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => empty,
  );
}
