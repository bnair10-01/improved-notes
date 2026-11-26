import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { Background, Controls, Position, ReactFlow, type Connection, type Edge, type Node } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { VLink, VNote } from "@/lib/vault";

type Props = {
  notes: VNote[]; links: VLink[]; focusId?: string;
  onOpen: (n: VNote) => void; onConnect: (from: string, to: string) => void;
  onDeleteLink: (id: string) => void; onDeleteNote: (n: VNote) => void;
};

const KIND_HUE: Record<string, string> = { handwritten: "var(--primary)", text: "var(--accent-foreground)", concept: "var(--chart-2, var(--primary))", generated: "var(--chart-4, var(--primary))" };

function layout(notes: VNote[], links: VLink[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 110 });
  g.setDefaultEdgeLabel(() => ({}));
  notes.forEach((n) => g.setNode(n.id, { width: 180, height: 44 }));
  links.forEach((l) => g.setEdge(l.from_note_id, l.to_note_id));
  dagre.layout(g);
  return (id: string) => { const p = g.node(id); return p ? { x: p.x - 90, y: p.y - 22 } : { x: 0, y: 0 }; };
}

export default function VaultGraph({ notes, links, focusId, onOpen, onConnect, onDeleteLink, onDeleteNote }: Props) {
  const [confirm, setConfirm] = useState<{ kind: "link"; id: string } | { kind: "note"; note: VNote } | null>(null);
  const { nodes, edges } = useMemo(() => {
    const ids = new Set(notes.map((n) => n.id));
    const ls = links.filter((l) => ids.has(l.from_note_id) && ids.has(l.to_note_id));
    const pos = layout(notes, ls);
    const nodes: Node[] = notes.map((n) => ({
      id: n.id, position: pos(n.id), sourcePosition: Position.Right, targetPosition: Position.Left, data: { label: n.title || "Untitled" },
      style: {
        width: 180, borderRadius: 14, fontSize: 13, padding: "8px 10px",
        background: "var(--card)", color: "var(--card-foreground)",
        border: `${n.id === focusId ? 2.5 : 1.5}px solid ${KIND_HUE[n.kind] ?? "var(--border)"}`,
        boxShadow: n.id === focusId ? "0 0 0 4px color-mix(in oklab, var(--primary) 20%, transparent)" : undefined,
      },
    }));
    const edges: Edge[] = ls.map((l) => ({
      id: l.id, source: l.from_note_id, target: l.to_note_id, label: l.label ?? undefined,
      animated: l.kind === "ai_suggested",
      style: { stroke: "var(--muted-foreground)", strokeDasharray: l.kind === "manual" ? "6 4" : undefined },
    }));
    return { nodes, edges };
  }, [notes, links, focusId]);

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  return (
    <>
      <ReactFlow
        nodes={nodes} edges={edges} fitView minZoom={0.2} proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, n) => { const v = byId.get(n.id); if (v) onOpen(v); }}
        onConnect={(c: Connection) => c.source && c.target && onConnect(c.source, c.target)}
        onEdgeClick={(_e, ed) => setConfirm({ kind: "link", id: ed.id })}
        onBeforeDelete={async ({ nodes: ns, edges: es }) => {
          const n = ns[0] && byId.get(ns[0].id);
          if (n) setConfirm({ kind: "note", note: n });
          else if (es[0]) setConfirm({ kind: "link", id: es[0].id });
          return false;
        }}
      >
        <Background gap={24} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "note" ? `Move "${confirm.note.title}" to Trash?` : "Remove this link?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.kind === "note" ? "You can restore it from Trash for 30 days." : "The notes stay; only the connection is removed. [[links]] typed in a note come back when that note is edited."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm?.kind === "note") onDeleteNote(confirm.note); else if (confirm) onDeleteLink(confirm.id); setConfirm(null); }}>
              {confirm?.kind === "note" ? "Move to Trash" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
