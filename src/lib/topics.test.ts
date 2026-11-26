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

describe("topicExport", () => {
  it("builds one Markdown source with every item under its title", () => {
    const md = topicExport({ name: "Bio" }, [note("1", "One", "alpha"), note("2", "Two", "beta", { kind: "handwritten" })]);
    expect(md.startsWith("# Bio")).toBe(true);
    expect(md).toContain("## One");
    expect(md).toContain("*scan*");
    expect(md).toContain("beta");
  });
});
