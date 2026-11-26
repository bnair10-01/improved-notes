import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, FilePlus2, Folder, FolderPlus, Lightbulb, MoreHorizontal, Network, NotebookPen, Pin, Search, Tag, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createFolder, createNote, deleteFolder, openTarget, purgeNote, renameFolder, renameNote, updateNote, useRefreshVault, type Vault, type VFolder, type VNote } from "@/lib/vault";

export function VaultSidebar({ vault, onNavigate }: { vault: Vault; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; act: () => Promise<void> } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const live = vault.notes.filter((n) => !n.deleted_at);
  const trash = vault.notes.filter((n) => n.deleted_at);
  const tags = [...new Set(live.flatMap((n) => n.tags))].sort();
  const ql = q.trim().toLowerCase();
  const filtered = live.filter((n) => (!tag || n.tags.includes(tag)) && (!ql || n.title.toLowerCase().includes(ql) || n.markdown.toLowerCase().includes(ql)));
  const flat = !!ql || !!tag;

  async function run(p: Promise<unknown>, ok?: string) {
    try { await p; await refresh(); if (ok) toast.success(ok); } catch { toast.error("Something went wrong. Please try again."); }
  }
  async function newNote(kind: "text" | "concept") {
    const id = await createNote({ title: kind === "concept" ? "New concept" : "Untitled", kind });
    await refresh();
    onNavigate?.();
    navigate({ to: "/vault/$noteId", params: { noteId: id } });
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button aria-label={`${n.title || "Untitled"} options`} className="shrink-0 opacity-60 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(n.id)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void run(updateNote(n.id, { pinned: !n.pinned }))}>{n.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => void run(updateNote(n.id, { deleted_at: new Date().toISOString() }), "Moved to Trash")}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            ) : <span className="flex-1 truncate font-medium">{f.name}</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button aria-label={`Folder ${f.name} options`} className="opacity-60 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void run(createNote({ folder_id: f.id }).then(refresh))}>New note here</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void run(createFolder("New folder", f.id))}>New subfolder</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing(f.id)}>Rename</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({ title: `Delete folder "${f.name}"?`, body: "Notes inside are kept and move out of the folder. Subfolders are deleted.", act: () => deleteFolder(f.id) })}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" onClick={() => newNote("text")}><FilePlus2 /> Note</Button>
        <Button size="sm" variant="outline" onClick={() => newNote("concept")}><Lightbulb /> Concept</Button>
        <Button size="sm" variant="outline" onClick={() => run(createFolder("New folder"))}><FolderPlus /> Folder</Button>
      </div>
      <Button asChild variant="ghost" size="sm" className="justify-start"><Link to="/vault/graph" onClick={onNavigate}><Network /> Graph view</Link></Button>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {showTrash ? (
          <section>
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trash · kept 30 days</h3>
            {!trash.length && <p className="px-2 text-sm text-muted-foreground">Trash is empty.</p>}
            {trash.map((n) => (
              <div key={n.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm">
                <span className="flex-1 truncate">{n.title}</span>
                <Button size="icon" variant="ghost" aria-label={`Restore ${n.title}`} onClick={() => run(updateNote(n.id, { deleted_at: null }), "Restored")}><Undo2 /></Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${n.title} forever`} onClick={() => setConfirm({ title: `Delete "${n.title}" forever?`, body: "This can't be undone.", act: () => purgeNote(n.id) })}><Trash2 /></Button>
              </div>
            ))}
          </section>
        ) : flat ? (
          <section>{filtered.map((n) => <NoteRow key={n.id} n={n} />)}{!filtered.length && <p className="px-2 text-sm text-muted-foreground">No matches.</p>}</section>
        ) : (
          <>
            {live.some((n) => n.pinned) && (
              <section><h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned</h3>{live.filter((n) => n.pinned).map((n) => <NoteRow key={n.id} n={n} />)}</section>
            )}
            <section>
              <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</h3>
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
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</h3>
            <div className="flex flex-wrap gap-1 px-2">
              {tags.map((t) => (
                <button key={t} onClick={() => setTag(tag === t ? null : t)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tag === t ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Tag className="h-3 w-3" />{t}</button>
              ))}
            </div>
          </section>
        )}
      </div>
      <Button variant="ghost" size="sm" className="justify-start" onClick={() => setShowTrash(!showTrash)}><Trash2 /> {showTrash ? "Back to notes" : `Trash${trash.length ? ` (${trash.length})` : ""}`}</Button>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.body}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirm) void run(confirm.act()); setConfirm(null); }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
