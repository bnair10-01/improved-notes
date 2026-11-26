import { describe, expect, it } from "vitest";
import { excerpt, itemKind, sharedConcepts, topicExport, topicMap } from "./topics";
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

describe("topicMap", () => {
  it("puts the topic in the middle and links items that link each other", () => {
    const notes = [note("1", "One", "x"), note("2", "Two", "y", { pinned: true })];
    const m = topicMap({ id: "f", name: "Bio" }, notes, [{ from_note_id: "1", to_note_id: "2", label: null as never }, { from_note_id: "1", to_note_id: "ghost", label: "x" }]);
    expect(m.nodes[0]).toMatchObject({ type: "topic", parent_id: null, label: "Bio" });
    expect(m.nodes).toHaveLength(3);
    expect(m.edges.filter((e) => e.kind === "hierarchy")).toHaveLength(2);
    expect(m.edges.filter((e) => e.kind === "cross_link")).toHaveLength(1);
    expect(m.nodes.find((n) => n.id === "2")?.importance).toBe(3);
  });
});

describe("topicMap across topics", () => {
  it("shows notes from other topics that link in, as satellites, and leaves unrelated notes out", () => {
    const inside = [note("1", "Mitochondria", "ATP")];
    const outsideNotes = [note("2", "Photosynthesis", "reverse of [[Mitochondria]]", { folder_id: "other" }), note("3", "Feudalism", "lords and vassals", { folder_id: "x" })];
    const m = topicMap({ id: "f", name: "Cell Biology" }, inside, [{ from_note_id: "2", to_note_id: "1", label: null as never }], outsideNotes);
    expect(m.nodes.map((n) => n.id)).toEqual(["topic:f", "1", "2"]);
    const sat = m.nodes.find((n) => n.id === "2")!;
    expect(sat.label).toBe("↗ Photosynthesis");
    expect(sat.parent_id).toBe("1");
    expect(m.edges.find((e) => e.to === "2")).toMatchObject({ from: "1", kind: "hierarchy" });
    expect(m.nodes.some((n) => n.id === "3")).toBe(false);
  });
  it("adds a cross link between two items without duplicating the tree edge", () => {
    const m = topicMap({ id: "f", name: "T" }, [note("1", "A", "x"), note("2", "B", "y")], [{ from_note_id: "1", to_note_id: "2", label: "causes" }, { from_note_id: "2", to_note_id: "1", label: "dup" }]);
    expect(m.edges.filter((e) => e.kind === "cross_link")).toHaveLength(1);
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
