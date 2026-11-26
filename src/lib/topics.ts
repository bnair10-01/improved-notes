import type { MindMap, MindNode } from "./mindmap-types";
import { words } from "./retrieve";
import type { VFolder, VLink, VNote } from "./vault";

export type ItemKind = "SCAN" | "NOTE" | "AUDIO" | "SLIDES" | "3D" | "WEBSITE" | "YOUTUBE" | "STUDY";

/** The label shown on an item's card, from how it was captured. */
export function itemKind(n: Pick<VNote, "kind" | "tags">): ItemKind {
  if (n.tags.includes("youtube")) return "YOUTUBE";
  if (n.tags.includes("website")) return "WEBSITE";
  switch (n.kind) {
    case "handwritten": return "SCAN";
    case "audio": return "AUDIO";
    case "slides": return "SLIDES";
    case "model3d": return "3D";
    case "generated": return "STUDY";
    default: return "NOTE";
  }
}

export const plainText = (md: string) => md.replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_>`~|-]+/g, " ").replace(/\s+/g, " ").trim();

export const excerpt = (md: string, max = 140) => {
  const t = plainText(md);
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};

/** Terms that show up in more than one of the topic's items: the ideas that tie them together. */
export function sharedConcepts(notes: Pick<VNote, "markdown">[], limit = 8): string[] {
  const inNotes = new Map<string, { notes: number; total: number }>();
  for (const n of notes) {
    const ws = words(n.markdown).filter((w) => w.length >= 4);
    for (const w of new Set(ws)) {
      const e = inNotes.get(w) ?? { notes: 0, total: 0 };
      e.notes++; e.total += ws.filter((x) => x === w).length;
      inNotes.set(w, e);
    }
  }
  return [...inNotes].filter(([, e]) => e.notes >= 2).sort((a, b) => b[1].notes - a[1].notes || b[1].total - a[1].total || a[0].localeCompare(b[0])).slice(0, limit).map(([w]) => w);
}

/** One Markdown file with everything in the topic, to use as a single source in NotebookLM or anywhere else. */
export function topicExport(folder: Pick<VFolder, "name">, notes: Pick<VNote, "title" | "markdown" | "kind" | "tags">[]): string {
  const parts = notes.map((n) => `## ${n.title || "Untitled"}\n\n*${itemKind(n).toLowerCase()}*\n\n${n.markdown.trim()}\n`);
  return `# ${folder.name}\n\n${parts.join("\n---\n\n")}`;
}

/**
 * The topic as a map: the topic in the middle, each item around it, and the links between items.
 * Notes from other topics that link to (or from) an item appear as "↗" satellites, so connections across topics show too.
 */
export function topicMap(
  folder: Pick<VFolder, "id" | "name">,
  notes: VNote[],
  links: Pick<VLink, "from_note_id" | "to_note_id" | "label">[],
  outside: VNote[] = [],
): MindMap {
  const rootNode: MindNode = { id: `topic:${folder.id}`, label: folder.name, summary: `${notes.length} item${notes.length === 1 ? "" : "s"}`, type: "topic", parent_id: null, importance: 3, source_snippet: "" };
  const inIds = new Set(notes.map((n) => n.id));
  const outById = new Map(outside.map((n) => [n.id, n]));
  const items: MindNode[] = notes.map((n) => ({
    id: n.id, label: n.title || "Untitled", summary: excerpt(n.markdown, 180), type: "subtopic", parent_id: rootNode.id,
    importance: n.pinned ? 3 : 2, source_snippet: "", note_id: n.id,
  }));

  // Outside notes hang off the first item they connect to.
  const parentOf = new Map<string, string>();
  for (const l of links) {
    const a = l.from_note_id, b = l.to_note_id;
    if (inIds.has(a) && outById.has(b) && !parentOf.has(b)) parentOf.set(b, a);
    else if (inIds.has(b) && outById.has(a) && !parentOf.has(a)) parentOf.set(a, b);
  }
  const satellites: MindNode[] = [...parentOf].map(([id, parent]) => {
    const o = outById.get(id)!;
    return { id, label: `↗ ${o.title || "Untitled"}`, summary: `From another topic. ${excerpt(o.markdown, 150)}`.trim(), type: "detail", parent_id: parent, importance: 1, source_snippet: "", note_id: id };
  });

  const nodes = [rootNode, ...items, ...satellites];
  const ids = new Set(nodes.map((n) => n.id));
  const tree = new Set(nodes.filter((n) => n.parent_id).map((n) => `${n.parent_id}|${n.id}`));
  const seen = new Set<string>();
  const cross = links.flatMap((l) => {
    const key = [l.from_note_id, l.to_note_id].sort().join("|");
    if (!ids.has(l.from_note_id) || !ids.has(l.to_note_id) || seen.has(key)) return [];
    if (tree.has(`${l.from_note_id}|${l.to_note_id}`) || tree.has(`${l.to_note_id}|${l.from_note_id}`)) return [];
    seen.add(key);
    return [{ from: l.from_note_id, to: l.to_note_id, label: l.label ?? "links to", kind: "cross_link" as const }];
  });
  return {
    central_topic: folder.name,
    nodes,
    edges: [
      ...items.map((i) => ({ from: rootNode.id, to: i.id, label: "", kind: "hierarchy" as const })),
      ...satellites.map((n) => ({ from: n.parent_id!, to: n.id, label: "links to", kind: "hierarchy" as const })),
      ...cross,
    ],
  };
}
