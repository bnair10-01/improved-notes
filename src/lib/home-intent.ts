/** What the Home box will do with what was typed. Pure, so the hint under the box and the Enter key always agree. */
export type HomeIntent =
  | { kind: "empty" }
  | { kind: "youtube" | "website"; url: string }
  | { kind: "ask"; question: string }
  | { kind: "note"; title: string; markdown: string };

const QUESTION_START = /^(what|why|how|when|where|who|whom|whose|which|is|are|was|were|do|does|did|can|could|should|would|will|explain|summari[sz]e|compare|define|list|tell me|what's|whats)\b/i;
const URL_LIKE = /^(https?:\/\/\S+|www\.\S+\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*)$/i;
const YOUTUBE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i;

/** A single pasted link, normalised to https, or null. */
export function asUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t) || !URL_LIKE.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch { return null; }
}

export const isYouTube = (url: string) => { try { return YOUTUBE.test(new URL(url).hostname); } catch { return false; } };

/** A short, single-line question. Long or multi-line text is treated as writing, even if it ends with "?". */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("\n") || t.length > 300) return false;
  return t.endsWith("?") || QUESTION_START.test(t);
}

/** Split typed text into a note title and body: a short first line becomes the title. */
export function toNote(text: string): { title: string; markdown: string } {
  const t = text.trim();
  const [first = "", ...rest] = t.split("\n");
  const head = first.trim().replace(/^#+\s*/, "");
  if (head && head.length <= 80) return { title: head, markdown: rest.join("\n").trim() };
  return { title: "Untitled", markdown: t };
}

/** `canAsk` is false when there is nothing in the vault to answer from: questions then become notes. */
export function homeIntent(text: string, canAsk: boolean): HomeIntent {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  const url = asUrl(t);
  if (url) return { kind: isYouTube(url) ? "youtube" : "website", url };
  if (canAsk && looksLikeQuestion(t)) return { kind: "ask", question: t };
  return { kind: "note", ...toNote(t) };
}
