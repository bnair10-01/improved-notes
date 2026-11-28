import { normalizeAnswer } from "./study-validate";

/**
 * Study that adapts to how you're doing. Flashcards step through three levels without any setting to fiddle with:
 * 0 Guided (a hint under the question), 1 Flip (just the card), 2 Recall (type the answer before you flip).
 * A few right in a row steps up; a couple of misses steps down. Quizzes suggest the next difficulty from the score.
 */
export type Level = 0 | 1 | 2;
export const LEVEL_NAMES = ["Guided", "Flip", "Recall"] as const;
export const LEVEL_NOTE: Record<Level, string> = {
  0: "A hint under each question while you find your feet.",
  1: "Flip the card and say whether you knew it.",
  2: "Type the answer before you flip. The hardest way to learn it.",
};
export const UP_AFTER = 3;
export const DOWN_AFTER = 2;
/** A hinted success counts for less, a typed-from-memory success for more, when scheduling the next review. */
export const LEVEL_BONUS: Record<Level, number> = { 0: 0.7, 1: 1, 2: 1.3 };

export type Run = { level: Level; right: number; wrong: number };
export const START_RUN: Run = { level: 1, right: 0, wrong: 0 };

export function step(run: Run, correct: boolean): Run & { moved: "up" | "down" | null } {
  const right = correct ? run.right + 1 : 0, wrong = correct ? 0 : run.wrong + 1;
  if (right >= UP_AFTER && run.level < 2) return { level: (run.level + 1) as Level, right: 0, wrong: 0, moved: "up" };
  if (wrong >= DOWN_AFTER && run.level > 0) return { level: (run.level - 1) as Level, right: 0, wrong: 0, moved: "down" };
  return { level: run.level, right, wrong, moved: null };
}

/** "Powerhouse of the cell" -> "P________ o_ t__ c___": the shape of the answer without giving it away. */
export function hintFor(answer: string): string {
  return answer.trim().split(/\s+/).filter(Boolean).map((w) => w[0] + "_".repeat(Math.min(8, Math.max(0, w.length - 1)))).join(" ");
}

const distance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]!; row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length]!;
};

/** Forgiving about case, punctuation, a typo or a missing small word; not about getting it wrong. */
export function looseMatch(typed: string, answer: string): boolean {
  const t = normalizeAnswer(typed), a = normalizeAnswer(answer);
  if (!t || !a) return false;
  if (t === a) return true;
  if (distance(t, a) <= Math.max(a.length >= 4 ? 1 : 0, Math.floor(a.length / 5))) return true;
  const want = a.split(" ").filter((w) => w.length > 2), have = new Set(t.split(" "));
  return want.length >= 3 && want.filter((w) => have.has(w)).length / want.length >= 0.75;
}

export type Difficulty = "easy" | "medium" | "hard";
const ORDER: Difficulty[] = ["easy", "medium", "hard"];
/** 85% or better asks for a harder quiz next, 50% or worse an easier one. */
export function nextDifficulty(current: Difficulty, score: number): Difficulty {
  const i = ORDER.indexOf(current);
  return ORDER[score >= 0.85 ? Math.min(2, i + 1) : score <= 0.5 ? Math.max(0, i - 1) : i] ?? "medium";
}
export const isDifficulty = (x: unknown): x is Difficulty => x === "easy" || x === "medium" || x === "hard";
