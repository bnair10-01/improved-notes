import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studyDueQuery } from "@/lib/study";
import { ChevronRight, FilePlus2, Folder, FolderPlus, Lightbulb, MoreHorizontal, Network, NotebookPen, Pin, Plus, Search, Tag, Trash2, Undo2 } from "lucide-react";
import { AddPopover } from "@/components/shell/AddMenu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemMenu } from "@/components/shell/ItemMenu";
import { useNoteActions, useTopicActions } from "@/components/vault/itemActions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NewTopicDialog } from "@/components/topics/NewTopicDialog";
import { createNote, deleteFolder, openTarget, purgeNote, renameFolder, renameNote, updateNote, useRefreshVault, type Vault, type VFolder, type VNote } from "@/lib/vault";

export function VaultSidebar({ vault, onNavigate }: { vault: Vault; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const item = useNoteActions();
  const topic = useTopicActions();
  const [showTrash, setShowTrash] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; act: () => Promise<void>; typed?: string } | null>(null);
  const [typedText, setTypedText] = useState("");
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState<{ parent: string | null } | null>(null);
  const { data: study } = useQuery(studyDueQuery);
  const due = study?.dueTotal ?? 0;

  const live = vault.notes.filter((n) => !n.deleted_at);
  const trash = vault.notes.filter((n) => n.deleted_at);
  const tags = [...new Set(live.flatMap((n) => n.tags))].sort();
  const ql = q.trim().toLowerCase();
  const filtered = live.filter((n) => (!tag || n.tags.includes(tag)) && (!ql || n.title.toLowerCase().includes(ql) || n.markdown.toLowerCase().includes(ql)));
  const flat = !!ql || !!tag;

  async function run(p: Promise<unknown>, ok?: string) {
    try { await p; await refresh(); if (ok) toast.success(ok); } catch { toast.error("Something went wrong. Please try again."); }
  }
  const go = (n: VNote) => { onNavigate?.(); navigate(openTarget(n)); };

  function NoteRow({ n }: { n: VNote }) {
    return (
      <div draggable onDragStart={(e) => e.dataTransfer.setData("text/note", n.id)}
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-secondary">
        {editing === n.id ? (
          <Input autoFocus defaultValue={n.title} aria-label="Note name" className="h-6 px-1 text-sm" onBlur={(e) => { setEditing(null); const t = e.target.value.trim(); if (t && t !== n.title) void run(renameNote(vault, n.id, n.title, t), "Renamed"); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }} />
        ) : (
        <button onClick={() => go(n)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {n.kind === "handwritten" ? <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : n.kind === "concept" ? <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{n.title || "Untitled"}</span>
        </button>)}
        {n.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
        <ItemMenu label={`${n.title || "Untitled"} options`} actions={item.actions(n)} />
      </div>
    );
  }

  function dropZone(folderId: string | null) {
    const key = folderId ?? "__none";
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDropOn(key); },
      onDragLeave: () => setDropOn(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); setDropOn(null);
        const id = e.dataTransfer.getData("text/note");
        if (id) void run(updateNote(id, { folder_id: folderId }), "Moved");
      },
      className: dropOn === key ? "rounded-md ring-2 ring-primary/50" : "",
    };
  }

  function FolderNode({ f, depth }: { f: VFolder; depth: number }) {
    const kids = vault.folders.filter((c) => c.parent_id === f.id);
    const notes = filtered.filter((n) => n.folder_id === f.id);
    const isOpen = open[f.id] ?? true;
    return (
      <div style={{ paddingLeft: depth ? 10 : 0 }}>
        <div {...dropZone(f.id)}>
          <div className="group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-secondary">
            <button onClick={() => setOpen({ ...open, [f.id]: !isOpen })} aria-label={isOpen ? "Collapse" : "Expand"}><ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} /></button>
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            {editing === f.id ? (
              <Input autoFocus defaultValue={f.name} className="h-6 px-1 text-sm" onBlur={(e) => { setEditing(null); if (e.target.value.trim() && e.target.value !== f.name) void run(renameFolder(f.id, e.target.value.trim())); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            ) : <Link to="/topics/$folderId" params={{ folderId: f.id }} onClick={onNavigate} className="flex-1 truncate font-medium hover:underline" title="Open topic page">{f.name}</Link>}
            {editing !== f.id && <span className="font-mono text-[11px] text-muted-foreground">{live.filter((n) => n.folder_id === f.id).length}</span>}
            <ItemMenu label={`Topic ${f.name} options`} actions={[
              { label: "New note here", icon: <FilePlus2 className="h-4 w-4" />, onSelect: () => run(createNote({ folder_id: f.id }).then(refresh)) },
              { label: "New subtopic", icon: <FolderPlus className="h-4 w-4" />, onSelect: () => setNewTopic({ parent: f.id }) },
              ...topic.actions(f),
            ]} />
          </div>
          {isOpen && <div className="pl-4">{notes.map((n) => <NoteRow key={n.id} n={n} />)}</div>}
        </div>
        {isOpen && kids.map((k) => <FolderNode key={k.id} f={k} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="pl-8" aria-label="Search notes" />
      </div>
      <AddPopover align="start"><button className="flex items-center justify-center gap-1.5 rounded-lg border bg-card py-2 text-[13px] font-medium hover:bg-secondary"><Plus className="h-3.5 w-3.5" aria-hidden />Add</button></AddPopover>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {showTrash ? (
          <section>
            <h3 className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Trash · kept until you empty it</h3>
            {!trash.length && <p className="px-2 text-sm text-muted-foreground">Trash is empty.</p>}
            {trash.length > 0 && <Button size="sm" variant="ghost" className="mb-1 w-full justify-start text-destructive" onClick={() => { setTypedText(""); setConfirm({ title: `Empty Trash (${trash.length} note${trash.length > 1 ? "s" : ""})?`, body: "These notes, their version history and links will be deleted for good. This can't be undone.", typed: "delete", act: async () => { for (const n of trash) await purgeNote(n.id); } }); }}>Empty Trash…</Button>}
            {trash.map((n) => (
              <div key={n.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm">
                <span className="flex-1 truncate">{n.title}</span>
                <Button size="icon" variant="ghost" aria-label={`Restore ${n.title}`} onClick={() => run(updateNote(n.id, { deleted_at: null }), "Restored")}><Undo2 /></Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${n.title} forever`} onClick={() => { setTypedText(""); setConfirm({ title: `Delete "${n.title}" forever?`, body: "Its version history and links go too. This can't be undone.", typed: "delete", act: () => purgeNote(n.id) }); }}><Trash2 /></Button>
              </div>
            ))}
          </section>
        ) : flat ? (
          <section>{filtered.map((n) => <NoteRow key={n.id} n={n} />)}{!filtered.length && <p className="px-2 text-sm text-muted-foreground">No matches.</p>}</section>
        ) : (
          <>
            {live.some((n) => n.pinned) && (
              <section><h3 className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Pinned</h3>{live.filter((n) => n.pinned).map((n) => <NoteRow key={n.id} n={n} />)}</section>
            )}
            <section>
              <h3 className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Folders</h3>
              {vault.folders.filter((f) => !f.parent_id).map((f) => <FolderNode key={f.id} f={f} depth={0} />)}
              <div {...dropZone(null)}>
                <p className="px-2 pt-2 text-xs text-muted-foreground">Not in a folder</p>
                {filtered.filter((n) => !n.folder_id).map((n) => <NoteRow key={n.id} n={n} />)}
              </div>
            </section>
          </>
        )}
        {tags.length > 0 && !showTrash && (
          <section>
            <h3 className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Tags</h3>
            <div className="flex flex-wrap gap-1 px-2">
              {tags.map((t) => (
                <button key={t} onClick={() => setTag(tag === t ? null : t)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tag === t ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Tag className="h-3 w-3" />{t}</button>
              ))}
            </div>
          </section>
        )}
      </div>
      {due > 0 && (
        <Link to="/study" onClick={onNavigate} className="flex items-center gap-2.5 rounded-xl border p-2.5">
          <span className="font-serif text-[22px] leading-none">{due}</span>
          <span className="flex-1 text-xs leading-tight text-muted-foreground">cards due<br />about {Math.max(1, Math.round(due / 2))} min</span>
          <span className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background">Study</span>
        </Link>
      )}
      <Button variant="ghost" size="sm" className="justify-start" onClick={() => setShowTrash(!showTrash)}><Trash2 /> {showTrash ? "Back to notes" : `Trash${trash.length ? ` (${trash.length})` : ""}`}</Button>

      <NewTopicDialog open={!!newTopic} onOpenChange={(o) => !o && setNewTopic(null)} parentId={newTopic?.parent ?? null} onCreated={(id) => { onNavigate?.(); navigate({ to: "/topics/$folderId", params: { folderId: id } }); }} />
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.body}</AlertDialogDescription></AlertDialogHeader>
          {confirm?.typed && <label className="grid gap-1 text-sm">Type <b>{confirm.typed}</b> to confirm<Input value={typedText} onChange={(e) => setTypedText(e.target.value)} autoFocus aria-label="Type delete to confirm" /></label>}
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!!confirm?.typed && typedText.trim().toLowerCase() !== confirm.typed} onClick={() => { if (confirm) void run(confirm.act()); setConfirm(null); }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {item.dialogs}{topic.dialogs}
    </div>
  );
}
