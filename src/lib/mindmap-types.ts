export type MindNodeType = "topic" | "subtopic" | "detail" | "action" | "question";
export type MindNode = {
  id: string;
  label: string;
  summary: string;
  type: MindNodeType;
  parent_id: string | null;
  importance: 1 | 2 | 3;
  source_snippet: string;
  position?: { x: number; y: number };
  collapsed?: boolean;
  note_id?: string;
  note_display?: "separate" | "inside";
};
export type MindEdge = { id?: string; from: string; to: string; label: string; kind: "hierarchy" | "cross_link" };
export type MindMap = { central_topic: string; nodes: MindNode[]; edges: MindEdge[] };

export function isMindMap(v: unknown): v is MindMap {
  return !!v && typeof v === "object" && typeof (v as MindMap).central_topic === "string" && Array.isArray((v as MindMap).nodes);
}

/** Root node id (the central topic). */
export function rootId(m: MindMap): string | undefined {
  return m.nodes.find((n) => n.parent_id === null)?.id;
}

export function childrenOf(m: MindMap, id: string) {
  return m.nodes.filter((n) => n.parent_id === id);
}

export function descendants(m: MindMap, id: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => childrenOf(m, p).forEach((c) => { out.push(c.id); walk(c.id); });
  walk(id);
  return out;
}

/** Nodes hidden because an ancestor is collapsed. */
export function hiddenIds(m: MindMap): Set<string> {
  const hidden = new Set<string>();
  m.nodes.filter((n) => n.collapsed).forEach((n) => descendants(m, n.id).forEach((d) => hidden.add(d)));
  return hidden;
}

/** Index (0-based) of the main branch a node belongs to; -1 for root. */
export function branchIndex(m: MindMap, id: string): number {
  const root = rootId(m);
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  if (!cur || cur.id === root) return -1;
  while (cur && cur.parent_id && cur.parent_id !== root) cur = byId.get(cur.parent_id);
  const branches = m.nodes.filter((n) => n.parent_id === root);
  return branches.findIndex((b) => b.id === cur?.id);
}

export function toOutline(m: MindMap): string {
  const root = rootId(m);
  if (!root) return `# ${m.central_topic}\n`;
  const lines = [`# ${m.central_topic}`, ""];
  const walk = (p: string, depth: number) =>
    childrenOf(m, p).forEach((c) => {
      lines.push(`${"  ".repeat(depth)}- ${c.label}${c.summary ? ` — ${c.summary}` : ""}`);
      walk(c.id, depth + 1);
    });
  walk(root, 0);
  const cross = m.edges.filter((e) => e.kind === "cross_link");
  if (cross.length) {
    const label = (id: string) => m.nodes.find((n) => n.id === id)?.label ?? id;
    lines.push("", "## Connections");
    cross.forEach((e) => lines.push(`- ${label(e.from)} → *${e.label || "related"}* → ${label(e.to)}`));
  }
  return lines.join("\n") + "\n";
}

/** Immutable updates keep legacy maps (without vault fields) valid. */
export function linkNodeToNote(map: MindMap, nodeId: string, noteId: string, display: "inside" | "separate" = "inside"): MindMap {
  if (!noteId.trim() || !map.nodes.some((n) => n.id === nodeId)) return map;
  return { ...map, nodes: map.nodes.map((n) => n.id === nodeId ? { ...n, note_id: noteId, note_display: display } : n) };
}

export function unlinkNode(map: MindMap, nodeId: string): MindMap {
  return { ...map, nodes: map.nodes.map((n) => {
    if (n.id !== nodeId) return n;
    const { note_id: _id, note_display: _display, ...rest } = n;
    return rest;
  }) };
}

/** A render-only projection. Never persist these extra nodes. */
export function withNoteNodes(map: MindMap, titles: ReadonlyMap<string, string>): MindMap {
  const nodes = [...map.nodes];
  const edges = [...map.edges];
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of map.nodes) {
    if (!n.note_id || n.note_display !== "separate") continue;
    let id = `vault:${n.id}`;
    while (ids.has(id)) id += ":";
    ids.add(id);
    nodes.push({ id, label: titles.get(n.note_id) ?? "Linked note unavailable", summary: "", type: "detail", parent_id: n.id, importance: 1, source_snippet: "", note_id: n.note_id });
    edges.push({ from: n.id, to: id, label: "note", kind: "hierarchy" });
  }
  return { ...map, nodes, edges };
}
