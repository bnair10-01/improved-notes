import { describe, expect, it } from "vitest";
import { hintFor, looseMatch, nextDifficulty, START_RUN, step, type Run } from "./adapt";

const play = (results: boolean[], from: Run = START_RUN) => results.reduce((r, ok) => step(r, ok), from);

describe("flashcard levels", () => {
  it("starts on Flip and steps up after three right in a row", () => {
    expect(play([true, true]).level).toBe(1);
    expect(step(play([true, true]), true)).toMatchObject({ level: 2, moved: "up", right: 0 });
  });
  it("a miss breaks the streak", () => {
    expect(play([true, true, false, true, true]).level).toBe(1);
  });
  it("steps down after two misses in a row, never below Guided or above Recall", () => {
    expect(step(play([false]), false)).toMatchObject({ level: 0, moved: "down" });
    expect(play([false, false, false, false, false, false]).level).toBe(0);
    expect(play([true, true, true, true, true, true, true, true, true]).level).toBe(2);
  });
  it("moves one level at a time", () => {
    const up = play([true, true, true]);
    expect(up.level).toBe(2);
    expect(play([false, false], up).level).toBe(1);
  });
});

describe("hints and typed answers", () => {
  it("shows the shape of the answer, not the answer", () => {
    expect(hintFor("Powerhouse of the cell")).toBe("P________ o_ t__ c___");
    expect(hintFor("  ATP ")).toBe("A__");
  });
  it("accepts case, punctuation, a typo and a missing small word", () => {
    expect(looseMatch("mitochondria", "Mitochondria")).toBe(true);
    expect(looseMatch("mitochondrai", "mitochondria")).toBe(true);
    expect(looseMatch("the powerhouse cell", "Powerhouse of the cell")).toBe(true);
  });
  it("rejects a wrong or empty answer", () => {
    expect(looseMatch("ribosome", "mitochondria")).toBe(false);
    expect(looseMatch("cat", "cut off")).toBe(false);
    expect(looseMatch("", "anything")).toBe(false);
  });
});

describe("next quiz difficulty", () => {
  it("goes harder at 85% or better, easier at 50% or worse, and stays put in between", () => {
    expect(nextDifficulty("medium", 0.9)).toBe("hard");
    expect(nextDifficulty("medium", 0.5)).toBe("easy");
    expect(nextDifficulty("medium", 0.7)).toBe("medium");
  });
  it("stops at the ends", () => {
    expect(nextDifficulty("hard", 1)).toBe("hard");
    expect(nextDifficulty("easy", 0)).toBe("easy");
  });
});

describe("typed answers stay strict enough", () => {
  it("tells similar terms apart", () => {
    expect(looseMatch("meiosis", "mitosis")).toBe(false);
    expect(looseMatch("atoms", "atom")).toBe(true);
  });
});
