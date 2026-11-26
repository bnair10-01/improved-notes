import type { VNote } from "./vault";

const STOP = new Set("a an and are as at be but by for from has have how i if in is it its of on or so that the their then there these they this to was we what when where which who why will with you your do does did can could should would about into than not".split(" "));

export const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w));

/** Pick the notes most relevant to a question (simple keyword scoring; no network, no AI). */
export function rankNotes(notes: VNote[], question: string, limit = 5): VNote[] {
  const q = new Set(words(question));
  if (!q.size) return [];
  const scored = notes
    .filter((n) => !n.deleted_at && n.markdown.trim())
    .map((n) => {
      const title = new Set(words(n.title));
      const body = words(n.markdown);
      let score = 0;
      for (const w of q) {
        if (title.has(w)) score += 5;
        score += Math.min(4, body.filter((b) => b === w).length);
      }
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.n.updated_at.localeCompare(a.n.updated_at));
  return scored.slice(0, limit).map((x) => x.n);
}

/** Build the text the model answers from, trimmed to a budget so short questions stay on-device. */
export function buildContext(notes: Pick<VNote, "title" | "markdown">[], maxChars = 5000): string {
  const per = Math.max(400, Math.floor(maxChars / Math.max(1, notes.length)));
  return notes.map((n) => `# ${n.title}\n${n.markdown.trim().slice(0, per)}`).join("\n\n").slice(0, maxChars + notes.length * 40);
}
