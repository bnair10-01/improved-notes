/** Pure validation for AI-generated flashcards and quizzes. */
export type CardType = "term" | "qa" | "cloze";
export type Card = { front: string; back: string; card_type: CardType; source_snippet: string };
export type QType = "mc" | "tf" | "short";
export type Question = { type: QType; question: string; options: string[]; answer: string; explanation: string; topic: string; source_snippet: string };

export const CARD_MIN = 5, CARD_MAX = 30, QUIZ_MIN = 3, QUIZ_MAX = 20;
export const clampCount = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n) || min));

const ILLEGIBLE = /\[illegible\]/i;
const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

export function validateCards(raw: unknown[], max = CARD_MAX): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const r of raw as Partial<Card>[]) {
    const front = clean(r?.front), back = clean(r?.back);
    const card_type: CardType = r?.card_type === "term" || r?.card_type === "cloze" ? r.card_type : "qa";
    if (!front || ILLEGIBLE.test(front) || ILLEGIBLE.test(back)) continue;
    if (card_type === "cloze" ? !/\{\{.+?\}\}/.test(front) : !back) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back, card_type, source_snippet: clean(r?.source_snippet) });
    if (out.length >= max) break;
  }
  return out;
}

/** "The {{sun}} rises" → { prompt: "The ___ rises", answer: "sun" } */
export function clozeParts(front: string) {
  const answers = [...front.matchAll(/\{\{(.+?)\}\}/g)].map((m) => m[1]);
  return { prompt: front.replace(/\{\{.+?\}\}/g, "___"), answer: answers.join(", ") };
}

export function validateQuestions(raw: unknown[], max = QUIZ_MAX): Question[] {
  const out: Question[] = [];
  for (const r of raw as Partial<Question>[]) {
    const question = clean(r?.question);
    let answer = clean(r?.answer);
    const type: QType = r?.type === "tf" || r?.type === "short" ? r.type : "mc";
    if (!question || !answer || ILLEGIBLE.test(question)) continue;
    let options: string[] = [];
    if (type === "mc") {
      options = [...new Set((r?.options ?? []).map(clean).filter(Boolean))];
      if (options.length < 2 || !options.includes(answer)) continue;
    } else if (type === "tf") {
      const a = answer.toLowerCase();
      if (a !== "true" && a !== "false") continue;
      answer = a === "true" ? "True" : "False";
      options = ["True", "False"];
    }
    out.push({ type, question, options, answer, explanation: clean(r?.explanation), topic: clean(r?.topic) || "General", source_snippet: clean(r?.source_snippet) });
    if (out.length >= max) break;
  }
  return out;
}

export const normalizeAnswer = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const isCorrect = (q: Question, given: string) => normalizeAnswer(given) === normalizeAnswer(q.answer);

/** Topics answered wrong more than right across attempts, worst first. */
export function weakTopics(results: { topic: string; correct: boolean }[]): string[] {
  const m = new Map<string, number>();
  for (const r of results) m.set(r.topic, (m.get(r.topic) ?? 0) + (r.correct ? -1 : 1));
  return [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;
/** Anki imports "front","back" rows; cloze cards keep {{c1::…}} syntax. */
export function toAnkiCsv(cards: Pick<Card, "front" | "back" | "card_type">[]) {
  return cards.map((c) => {
    if (c.card_type === "cloze") { let i = 0; return [csvCell(c.front.replace(/\{\{(.+?)\}\}/g, (_, a) => `{{c${++i}::${a}}}`)), csvCell(c.back)].join(","); }
    return [csvCell(c.front), csvCell(c.back)].join(",");
  }).join("\n");
}
