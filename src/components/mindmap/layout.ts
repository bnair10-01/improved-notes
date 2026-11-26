import dagre from "@dagrejs/dagre";
import type { MindMap } from "@/lib/mindmap-types";

export function nodeSize(importance: number) {
  return importance >= 3 ? { w: 250, h: 180 } : importance === 2 ? { w: 240, h: 168 } : { w: 230, h: 160 };
}

/** Left-to-right tree layout; returns positions for every visible node. */
export function autoLayout(m: MindMap, visible: Set<string>) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  m.nodes.filter((n) => visible.has(n.id)).forEach((n) => {
    const s = nodeSize(n.importance);
    g.setNode(n.id, { width: s.w, height: s.h });
  });
  m.nodes.forEach((n) => {
    if (n.parent_id && visible.has(n.id) && visible.has(n.parent_id)) g.setEdge(n.parent_id, n.id);
  });
  dagre.layout(g);
  const out: Record<string, { x: number; y: number }> = {};
  g.nodes().forEach((id) => {
    const p = g.node(id);
    if (p) out[id] = { x: p.x - p.width / 2, y: p.y - p.height / 2 };
  });
  return out;
}
