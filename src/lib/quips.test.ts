import { describe, expect, it } from "vitest";
import { QUIPS, shuffled } from "./quips";

describe("waiting lines", () => {
  it("every set has plenty to read, with no repeats and nothing empty", () => {
    for (const [name, list] of Object.entries(QUIPS)) {
      expect(list.length, name).toBeGreaterThanOrEqual(4);
      expect(new Set(list).size, name).toBe(list.length);
      for (const line of list) { expect(line.trim().length, name).toBeGreaterThan(10); expect(line.length, name).toBeLessThan(140); }
    }
  });
  it("shuffling keeps every line and never changes the original", () => {
    const base = ["a", "b", "c", "d", "e"];
    const out = shuffled(base, () => 0.3);
    expect([...out].sort()).toEqual(base);
    expect(base).toEqual(["a", "b", "c", "d", "e"]);
  });
});
