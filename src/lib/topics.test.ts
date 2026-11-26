import { describe, expect, it } from "vitest";
import { excerpt, itemKind, outsideLinked, sharedConcepts, topicExport } from "./topics";
import type { VNote } from "./vault";

const note = (id: string, title: string, markdown: string, extra: Partial<VNote> = {}): VNote => ({
  id, title, markdown, kind: "text", folder_id: "f", tags: [], pinned: false, deleted_at: null,
  updated_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", source_note_ids: [], ...extra,
});

describe("itemKind", () => {
  it("labels items by how they were captured", () => {
    expect(itemKind({ kind: "handwritten", tags: [] })).toBe("SCAN");
    expect(itemKind({ kind: "text", tags: ["youtube"] })).toBe("YOUTUBE");
    expect(itemKind({ kind: "text", tags: ["website"] })).toBe("WEBSITE");
    expect(itemKind({ kind: "slides", tags: [] })).toBe("SLIDES");
    expect(itemKind({ kind: "concept", tags: [] })).toBe("NOTE");
  });
});

describe("excerpt", () => {
  it("strips markdown and wikilinks and trims long text", () => {
    expect(excerpt("# Title\n\nSee [[Other note]] and **bold** [link](http://x.y)")).toBe("Title See Other note and bold link");
    expect(excerpt("a ".repeat(200), 20).endsWith("…")).toBe(true);
  });
});

describe("sharedConcepts", () => {
  it("returns terms that appear in more than one item, most shared first", () => {
    const notes = [note("1", "a", "Strategy and design decide direction"), note("2", "b", "Design strategy focuses on direction"), note("3", "c", "Lunch menu notes")];
    const s = sharedConcepts(notes);
    expect(s).toEqual(expect.arrayContaining(["design", "strategy", "direction"]));
    expect(s).not.toContain("lunch");
  });
  it("is empty with a single item", () => {
    expect(sharedConcepts([note("1", "a", "only one note here")])).toEqual([]);
  });
});

describe("outsideLinked", () => {
  const all = [note("1", "Mitochondria", "x", { folder_id: "f" }), note("2", "Photosynthesis", "y", { folder_id: "g" }), note("3", "Feudalism", "z", { folder_id: "h" }), note("4", "Gone", "w", { folder_id: "g", deleted_at: "x" })];
  it("returns notes from other topics that link in or out, and leaves unrelated notes and trashed ones out", () => {
    const r = outsideLinked([all[0]!], all, [{ from_note_id: "2", to_note_id: "1" }, { from_note_id: "4", to_note_id: "1" }]);
    expect(r.map((n) => n.id)).toEqual(["2"]);
  });
  it("finds links pointing out of the topic as well", () => {
    expect(outsideLinked([all[0]!], all, [{ from_note_id: "1", to_note_id: "3" }]).map((n) => n.id)).toEqual(["3"]);
  });
  it("ignores links between two notes in the topic", () => {
    expect(outsideLinked([all[0]!, all[1]!], all, [{ from_note_id: "1", to_note_id: "2" }])).toEqual([]);
  });
});

describe("topicExport", () => {
  it("builds one Markdown source with every item under its title", () => {
    const md = topicExport({ name: "Bio" }, [note("1", "One", "alpha"), note("2", "Two", "beta", { kind: "handwritten" })]);
    expect(md.startsWith("# Bio")).toBe(true);
    expect(md).toContain("## One");
    expect(md).toContain("*scan*");
    expect(md).toContain("beta");
  });
});
