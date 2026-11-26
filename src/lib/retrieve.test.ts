import { describe, expect, it } from "vitest";
import { buildContext, rankNotes } from "./retrieve";
import type { VNote } from "./vault";

const note = (id: string, title: string, markdown: string, extra: Partial<VNote> = {}): VNote => ({
  id, title, markdown, kind: "text", folder_id: null, tags: [], pinned: false, deleted_at: null,
  updated_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", source_note_ids: [], ...extra,
});

describe("rankNotes", () => {
  const notes = [
    note("1", "Mitochondria", "The mitochondrion makes ATP through respiration."),
    note("2", "Design Strategy", "Strategy decides what to build and why."),
    note("3", "Shopping", "Milk, eggs, bread."),
  ];
  it("puts the best matching note first and drops unrelated ones", () => {
    const r = rankNotes(notes, "how does the mitochondria make ATP?");
    expect(r.map((n) => n.id)).toEqual(["1"]);
  });
  it("ignores trashed and empty notes", () => {
    const r = rankNotes([note("1", "Mitochondria", "ATP", { deleted_at: "x" }), note("2", "ATP", "  ")], "ATP");
    expect(r).toEqual([]);
  });
  it("returns nothing for a question with no usable words", () => {
    expect(rankNotes(notes, "what is it?")).toEqual([]);
  });
});

describe("buildContext", () => {
  it("keeps titles and stays within the budget", () => {
    const c = buildContext([note("1", "A", "x".repeat(9000)), note("2", "B", "y".repeat(9000))], 2000);
    expect(c).toContain("# A");
    expect(c).toContain("# B");
    expect(c.length).toBeLessThan(2200);
  });
});
