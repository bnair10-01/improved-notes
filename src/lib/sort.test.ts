import { describe, expect, it } from "vitest";
import { sortNotes } from "./sort";
const n = (title: string, u: string, c: string, pinned = false) => ({ title, updated_at: u, created_at: c, pinned });
const list = [n("b", "2026-01-03", "2026-01-01"), n("A", "2026-01-01", "2026-01-03"), n("c", "2026-01-02", "2026-01-02", true)];
describe("note sorting", () => {
  it("pinned notes stay on top", () => { expect(sortNotes(list, "title")[0]?.title).toBe("c"); });
  it("recently edited first", () => { expect(sortNotes(list, "recent").map((x) => x.title)).toEqual(["c", "b", "A"]); });
  it("newest created first", () => { expect(sortNotes(list, "created").map((x) => x.title)).toEqual(["c", "A", "b"]); });
  it("A–Z ignores case", () => { expect(sortNotes(list, "title").map((x) => x.title)).toEqual(["c", "A", "b"]); });
});
