import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addLink, createNote, openTarget, useRefreshVault, useVault } from "@/lib/vault";
import { linkNodeToNote, unlinkNode, type MindMap, type MindNode } from "@/lib/mindmap-types";

type Context = { sourceNoteId: string | null; busy: boolean; make: (node: MindNode) => void; pick: (node: MindNode) => void; display: (node: MindNode, display: "inside" | "separate") => void; unlink: (node: MindNode) => void };
const VaultContext = createContext<Context | null>(null);

export function NodeVaultProvider({ value, onChange, sourceNoteId, sourceNoteTitle, children }: {
  value: MindMap; onChange: (map: MindMap) => void; sourceNoteId: string | null; sourceNoteTitle: string | null; children: ReactNode;
}) {
  const vault = useVault();
  const refresh = useRefreshVault();
  const latest = useRef({ value, onChange, sourceNoteId });
  latest.current = { value, onChange, sourceNoteId };
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const retries = useRef(new Map<string, string>());
  const change = (nodeId: string, noteId: string, display: "inside" | "separate" = "inside") => {
    const current = latest.current;
    if (current.sourceNoteId !== sourceNoteId) return;
    current.onChange(linkNodeToNote(current.value, nodeId, noteId, display));
  };
  async function make(node: MindNode) {
    if (!sourceNoteId || lock.current) return;
    lock.current = true;
    setBusy(true);
    const key = `${sourceNoteId}:${node.id}`;
    try {
      let id = retries.current.get(key);
      if (!id) {
        const sourceTitle = sourceNoteTitle || vault.data?.notes.find((n) => n.id === sourceNoteId)?.title;
        const markdown = [node.summary, `> From: ${node.source_snippet.replace(/\r?\n/g, "\n> ")}`, sourceTitle ? `[[${sourceTitle}]]` : ""].filter(Boolean).join("\n\n");
        id = await createNote({ title: node.label, kind: "concept", markdown });
        retries.current.set(key, id);
      }
      await addLink(id, sourceNoteId, "manual", "from mind map");
      change(node.id, id);
      retries.current.delete(key);
      await refresh();
      toast.success("Concept note created");
    } catch {
      toast.error("Couldn't finish linking the note. Try again; an already-created note will be reused.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const results = (vault.data?.notes ?? []).filter((n) => !n.deleted_at && n.id !== sourceNoteId && n.title.toLowerCase().includes(query.toLowerCase()));
  return <VaultContext.Provider value={{ sourceNoteId, busy, make: (n) => { void make(n); }, pick: (n) => { setQuery(""); setPicking(n.id); }, display: (n, display) => { if (n.note_id) change(n.id, n.note_id, display); }, unlink: (n) => { const current = latest.current; current.onChange(unlinkNode(current.value, n.id)); } }}>
    {children}
    <Dialog open={picking !== null} onOpenChange={(open) => { if (!open) setPicking(null); }}>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogHeader><DialogTitle>Link to existing note</DialogTitle><DialogDescription>Choose a vault note for this node.</DialogDescription></DialogHeader>
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search vault notes" placeholder="Search notes" />
        {vault.isPending ? <p role="status">Loading notes…</p> : vault.isError ? <div role="alert">Couldn't load notes. <Button onClick={() => { void vault.refetch(); }}>Retry</Button></div> : <ul className="max-h-80 overflow-auto">
          {results.map((n) => <li key={n.id}><Button className="h-auto min-h-11 w-full justify-start whitespace-normal text-left" variant="ghost" onClick={() => { if (picking && latest.current.sourceNoteId === sourceNoteId) change(picking, n.id); setPicking(null); }}>{n.title}</Button></li>)}
          {!results.length && <li className="p-2 text-sm text-muted-foreground">No notes found.</li>}
        </ul>}
      </DialogContent>
    </Dialog>
  </VaultContext.Provider>;
}

export function NoteIcon({ node }: { node: MindNode }) {
  const vault = useVault();
  const note = vault.data?.notes.find((n) => n.id === node.note_id && !n.deleted_at);
  if (!node.note_id) return null;
  if (!note) return <span className="inline-flex min-h-11 min-w-11 items-center justify-center" title="Linked note unavailable" aria-label="Linked note unavailable"><FileText className="h-4 w-4" /></span>;
  return <Link {...openTarget(note)} className="nodrag nopan inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Open note: ${note.title}`} onClick={(e) => e.stopPropagation()}><FileText className="h-4 w-4" /></Link>;
}

export function NodeVaultActions({ node, compact = false }: { node: MindNode; compact?: boolean }) {
  const context = useContext(VaultContext);
  if (!context) return null;
  const disabled = !context.sourceNoteId || context.busy;
  return <div className="nodrag nopan flex flex-wrap gap-1 text-foreground" onClick={(e) => e.stopPropagation()}>
    <Button size="sm" variant="outline" className="min-h-11" disabled={disabled || !!node.note_id} onClick={() => context.make(node)}>Make into note</Button>
    <Button size="sm" variant="outline" className="min-h-11" disabled={disabled} onClick={() => context.pick(node)}>Link to existing note</Button>
    {!context.sourceNoteId && <p className="w-full text-xs text-muted-foreground">Save the note first</p>}
    {node.note_id && !compact && <>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`display-${node.id}`} checked={(node.note_display ?? "inside") === "inside"} disabled={disabled} onChange={() => context.display(node, "inside")} />Keep inside this node</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`display-${node.id}`} checked={node.note_display === "separate"} disabled={disabled} onChange={() => context.display(node, "separate")} />Show as separate note node</label>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => context.unlink(node)}>Unlink note</Button>
    </>}
  </div>;
}
