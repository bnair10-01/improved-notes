import { describe, expect, it } from "vitest";
import { bestExistingTopic, hasEnoughToSuggest } from "./topic-suggest";
import type { VFolder, VNote } from "./vault";

const note = (id: string, title: string, markdown: string, folder_id: string | null = null): VNote => ({
  id, title, markdown, kind: "text", folder_id, tags: [], pinned: false, deleted_at: null,
  updated_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", source_note_ids: [],
});
const folders: VFolder[] = [{ id: "bio", name: "Cell Biology", parent_id: null }, { id: "hist", name: "Medieval History", parent_id: null }];
const filed = [
  note("1", "Mitochondria", "The mitochondrion makes most of the cell's ATP through respiration. Its inner membrane folds into cristae and a proton gradient drives ATP synthase.", "bio"),
  note("2", "ATP", "ATP is the energy currency of the cell. Cells spend ATP on movement and active transport. Most of it is made in the mitochondria.", "bio"),
  note("3", "Feudalism", "Feudalism tied lords and vassals together through land and loyalty. Peasants worked the land in return for protection.", "hist"),
];

describe("bestExistingTopic", () => {
  it("suggests the topic whose notes a new note shares the most with", () => {
    const fresh = note("9", "Ribosomes", "Ribosomes build proteins inside the cell, and mitochondria have their own ribosomes that make some of the ATP machinery for respiration.");
    expect(bestExistingTopic(fresh, [fresh, ...filed], folders)?.name).toBe("Cell Biology");
  });

  it("suggests nothing when the note has no topic that fits", () => {
    const other = note("9", "Pasta", "Boil salted water, add the pasta, and cook until tender. Drain, toss with olive oil, garlic and plenty of black pepper before serving hot.");
    expect(bestExistingTopic(other, [other, ...filed], folders)).toBeNull();
  });

  it("does not second-guess a note that already has a topic, or one with too little text", () => {
    const filedAlready = note("9", "X", "mitochondria ATP respiration cristae proton gradient synthase energy cell membrane folds", "hist");
    expect(bestExistingTopic(filedAlready, [filedAlready, ...filed], folders)).toBeNull();
    const short = note("8", "Short", "mitochondria");
    expect(hasEnoughToSuggest(short)).toBe(false);
    expect(bestExistingTopic(short, [short, ...filed], folders)).toBeNull();
  });
});
