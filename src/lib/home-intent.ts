/** What the Home box will do with what was typed. Pure, so the hint under the box and the Enter key always agree. */
export type HomeIntent =
  | { kind: "empty" }
  | { kind: "youtube" | "website"; url: string }
  | { kind: "ask"; question: string }
  | { kind: "learn"; subject: string }
  | { kind: "note"; title: string; markdown: string };

const QUESTION_START = /^(what|why|how|when|where|who|whom|whose|which|is|are|was|were|do|does|did|can|could|should|would|will|explain|summari[sz]e|compare|define|list|tell me|what's|whats)\b/i;
const URL_LIKE = /^(https?:\/\/\S+|www\.\S+\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*)$/i;
const YOUTUBE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i;

/**
 * Ways of asking to learn about a subject, each ending where the subject begins:
 * "need to learn more on X", "study X", "need notes on X", "make me a summary of X", "videos about X".
 */
const LEARN_LEADS: RegExp[] = [
  /^(?:(?:i\s+)?(?:really\s+)?(?:need|want|have|got|would like|'d like|wanna|gotta)\s+to\s+(?:learn|study|understand|research|read up)|(?:let'?s|help me|i'm going to|i will)\s+(?:learn|study|understand|research)|learn|study|research|read up|teach me|help me understand)(?:\s+(?:more|a bit more|a lot more))?(?:\s+(?:about|on|of|up on))?\s+/i,
  /^(?:(?:i\s+)?(?:really\s+)?(?:need|want|require|would like|'d like)\s+|(?:please\s+)?(?:make|write|build|create|get|find|give|show)(?:\s+me)?\s+)(?:some\s+|a\s+few\s+|the\s+|good\s+|better\s+)*(?:notes|a summary|an overview|summary|overview|info|information|resources|materials?|videos?|articles?)\s+(?:on|about|for|of|regarding)\s+/i,
  /^(?:notes|summary|overview|info|information|resources)\s+(?:on|about|for|of)\s+/i,
];

/** The subject of a learning wish, or null. */
export function learnSubject(text: string): string | null {
  const t = text.trim().replace(/[.!]+$/, "");
  if (!t || t.includes("\n") || t.length > 120) return null;
  for (const lead of LEARN_LEADS) {
    const m = lead.exec(t);
    if (!m) continue;
    const subject = t.slice(m[0].length).replace(/^(?:the|a|an)\s+/i, "").replace(/[?.!]+$/, "").trim();
    if (subject.length >= 2 && subject.length <= 80 && !asUrl(subject)) return subject;
  }
  return null;
}

/** The subject inside a question: "what is a black hole?" -> "black hole", "how does gps work?" -> "gps". */
export function questionSubject(question: string): string {
  const q = question.trim().replace(/[?.!]+$/, "");
  const m = /^(?:what|who)(?:'s|s| is| are| was| were)\s+(?:a |an |the )?(.+)$/i.exec(q)
    ?? /^how\s+(?:does|do|did|can)\s+(?:a |an |the )?(.+?)\s+(?:work|works|happen|form|forms)$/i.exec(q)
    ?? /^(?:explain|define|tell me about|summari[sz]e)\s+(?:a |an |the )?(.+)$/i.exec(q);
  return (m?.[1] ?? q).trim();
}

/** A short phrase that could be a subject on its own ("black holes"): offered as research, never done unasked. */
export function couldBeSubject(text: string): boolean {
  const t = text.trim();
  return !!t && !t.includes("\n") && t.length <= 60 && t.split(/\s+/).length <= 6 && !asUrl(t) && !/^\S+\.\S+$/.test(t);
}

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

/** `canAsk` is false when there is nothing in the vault to answer from: questions then go and look the subject up. */
export function homeIntent(text: string, canAsk: boolean): HomeIntent {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  const url = asUrl(t);
  if (url) return { kind: isYouTube(url) ? "youtube" : "website", url };
  const subject = learnSubject(t);
  if (subject) return { kind: "learn", subject };
  if (looksLikeQuestion(t)) return canAsk ? { kind: "ask", question: t } : { kind: "learn", subject: questionSubject(t) };
  return { kind: "note", ...toNote(t) };
}

/** What the person asked Enter to do: decide from the text (auto), always look the text up, or always make a note. */
export type HomeMode = "auto" | "research" | "note";

/** Apply the chosen mode to what auto-detection decided. Links keep reading as links when researching. */
export function forceMode(mode: HomeMode, text: string, intent: HomeIntent): HomeIntent {
  const t = text.trim();
  if (mode === "auto" || !t) return intent;
  if (mode === "note") return { kind: "note", ...toNote(t) };
  if (intent.kind === "youtube" || intent.kind === "website") return intent;
  const subject = learnSubject(t) ?? (looksLikeQuestion(t) ? questionSubject(t) : (t.split("\n")[0] ?? t).replace(/^#+\s*/, "").slice(0, 80).trim());
  return { kind: "learn", subject };
}
