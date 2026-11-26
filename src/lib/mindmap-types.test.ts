import { describe, expect, it } from "vitest";
import { branchIndex, hiddenIds, toOutline, linkNodeToNote, unlinkNode, withNoteNodes, type MindMap } from "./mindmap-types";

const m: MindMap = {
  central_topic: "Plan",
  nodes: [
    { id: "r", label: "Plan", summary: "", type: "topic", parent_id: null, importance: 3, source_snippet: "" },
    { id: "a", label: "Budget", summary: "", type: "subtopic", parent_id: "r", importance: 2, source_snippet: "" },
    { id: "b", label: "Hiring", summary: "", type: "subtopic", parent_id: "r", importance: 2, source_snippet: "", collapsed: true },
    { id: "b1", label: "Post job", summary: "", type: "action", parent_id: "b", importance: 1, source_snippet: "" },
  ],
  edges: [{ from: "a", to: "b1", label: "funds", kind: "cross_link" }],
};

describe("mind map helpers", () => {
  it("sub-nodes inherit their main branch", () => expect(branchIndex(m, "b1")).toBe(1));
  it("collapsing a branch hides its children", () => expect([...hiddenIds(m)]).toEqual(["b1"]));
  it("outline nests children under parents", () => expect(toOutline(m)).toContain("- Hiring\n  - Post job"));
});

describe("vault node links", () => {
  it("links immutably and defaults legacy nodes to inside", () => {
    const next = linkNodeToNote(m, "a", "note-1");
    expect(next.nodes.find((n) => n.id === "a")).toMatchObject({ note_id: "note-1", note_display: "inside" });
    expect(m.nodes.find((n) => n.id === "a")).not.toHaveProperty("note_id");
    expect(next.edges).toBe(m.edges);
    expect(linkNodeToNote(m, "missing", "note-1")).toBe(m);
    expect(linkNodeToNote(m, "a", " ")).toBe(m);
  });
  it("unlinks without losing manual edits or leaving undefined properties", () => {
    const linked = linkNodeToNote(m, "b", "note-1", "separate");
    const next = unlinkNode(linked, "b");
    expect(next).toEqual(m);
    expect(next.nodes.find((n) => n.id === "b")).not.toHaveProperty("note_id");
    expect(next.nodes.find((n) => n.id === "b")).not.toHaveProperty("note_display");
    expect(linked.nodes.find((n) => n.id === "b")?.note_id).toBe("note-1");
  });
  it("projects separate notes without persisting them and honors collapsed parents", () => {
    const linked = linkNodeToNote(m, "b", "note-1", "separate");
    const projected = withNoteNodes(linked, new Map([["note-1", "Hiring note"]]));
    expect(projected.nodes).toHaveLength(m.nodes.length + 1);
    const note = projected.nodes.find((n) => n.label === "Hiring note");
    expect(note?.parent_id).toBe("b");
    expect(hiddenIds(projected).has(note!.id)).toBe(true);
    expect(linked.nodes).toHaveLength(m.nodes.length);
    expect(withNoteNodes(linkNodeToNote(m, "a", "note-1"), new Map()).nodes).toEqual(linkNodeToNote(m, "a", "note-1").nodes);
  });
  it("avoids generated id collisions and handles unavailable notes", () => {
    const linked = linkNodeToNote({ ...m, nodes: [...m.nodes, { ...m.nodes[0]!, id: "vault:a", parent_id: "r" }] }, "a", "gone", "separate");
    const projected = withNoteNodes(linked, new Map());
    expect(new Set(projected.nodes.map((n) => n.id)).size).toBe(projected.nodes.length);
    expect(projected.nodes.at(-1)?.label).toBe("Linked note unavailable");
  });
});
