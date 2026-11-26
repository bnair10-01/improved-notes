import { relatedPairs } from "./related";
import { words } from "./retrieve";
import type { VFolder, VNote } from "./vault";

export type TopicFit = { folderId: string; name: string; score: number };

/** Enough written to say something sensible about. */
export const hasEnoughToSuggest = (n: Pick<VNote, "markdown">) => words(n.markdown).length >= 12;

/**
 * Which of the person's existing topics does this note belong with? Scored by how much it shares with the notes already
 * filed there (the same measure the graph uses). Instant, on the device. Returns null when nothing fits well.
 */
export function bestExistingTopic(note: VNote, all: VNote[], folders: VFolder[], minScore = 0.08): TopicFit | null {
  if (note.folder_id || !hasEnoughToSuggest(note)) return null;
  const filed = all.filter((n) => n.id !== note.id && !n.deleted_at && n.folder_id && n.markdown.trim());
  if (!filed.length) return null;
  const pairs = relatedPairs([note, ...filed], { minScore: 0.04, perNote: 1000 }).filter((p) => p.a === note.id || p.b === note.id);
  const byId = new Map(filed.map((n) => [n.id, n]));
  const best = new Map<string, number>();
  for (const p of pairs) {
    const other = byId.get(p.a === note.id ? p.b : p.a);
    if (!other?.folder_id) continue;
    best.set(other.folder_id, Math.max(best.get(other.folder_id) ?? 0, p.score));
  }
  const [id, score] = [...best].sort((a, b) => b[1] - a[1])[0] ?? [];
  const folder = id ? folders.find((f) => f.id === id) : undefined;
  return folder && score !== undefined && score >= minScore ? { folderId: folder.id, name: folder.name, score } : null;
}

const KEY = (noteId: string) => `topic-suggestion-dismissed:${noteId}`;
export const isDismissed = (noteId: string) => { try { return localStorage.getItem(KEY(noteId)) === "1"; } catch { return false; } };
export const dismissSuggestion = (noteId: string) => { try { localStorage.setItem(KEY(noteId), "1"); } catch { /* storage unavailable */ } };
