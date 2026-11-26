import { describe, expect, it } from "vitest";
import { isDue, schedule } from "./srs";

const now = new Date("2026-01-01T00:00:00Z");
const fresh = { reps: 0, interval_days: 0, ease: 2.5 };

describe("spaced repetition", () => {
  it("first 'Know it' is due in 1 day", () => {
    expect(schedule(fresh, "know", now).due_at).toBe("2026-01-02T00:00:00.000Z");
  });
  it("second 'Know it' is due in 3 days", () => {
    expect(schedule({ reps: 1, interval_days: 1, ease: 2.5 }, "know", now).interval_days).toBe(3);
  });
  it("later reviews multiply the interval by ease", () => {
    expect(schedule({ reps: 2, interval_days: 3, ease: 2.5 }, "know", now).interval_days).toBe(8);
  });
  it("'Review again' resets and returns in 10 minutes", () => {
    const s = schedule({ reps: 4, interval_days: 20, ease: 2.5 }, "again", now);
    expect(s.reps).toBe(0);
    expect(s.due_at).toBe("2026-01-01T00:10:00.000Z");
  });
  it("ease never drops below 1.3", () => {
    expect(schedule({ reps: 0, interval_days: 0, ease: 1.3 }, "again", now).ease).toBe(1.3);
  });
  it("a card is due once its time passes", () => {
    expect(isDue("2025-12-31T00:00:00Z", now)).toBe(true);
    expect(isDue("2026-01-02T00:00:00Z", now)).toBe(false);
  });
});
