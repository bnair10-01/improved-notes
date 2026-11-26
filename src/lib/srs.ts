/** Simple spaced-repetition scheduling (SM-2 style) for "Know it" / "Review again". */
export type SrsState = { reps: number; interval_days: number; ease: number };
export type Grade = "know" | "again";

const DAY = 86_400_000;
export const AGAIN_MINUTES = 10;

export function schedule(s: SrsState, grade: Grade, now = new Date()): SrsState & { due_at: string } {
  if (grade === "again") {
    return { reps: 0, interval_days: 0, ease: Math.max(1.3, +(s.ease - 0.2).toFixed(2)), due_at: new Date(now.getTime() + AGAIN_MINUTES * 60_000).toISOString() };
  }
  const reps = s.reps + 1;
  const interval_days = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(1, s.interval_days) * s.ease);
  const ease = Math.min(3, +(s.ease + 0.05).toFixed(2));
  return { reps, interval_days, ease, due_at: new Date(now.getTime() + interval_days * DAY).toISOString() };
}

export const isDue = (due_at: string, now = new Date()) => new Date(due_at).getTime() <= now.getTime();
