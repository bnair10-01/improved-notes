import { useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listVersions, restoreVersion, type NoteVersion } from "@/lib/vault";

/** Every earlier version of a note, kept until the note itself is permanently deleted. */
export function VersionHistory({ noteId, title, markdown, onRestored }: {
  noteId: string; title: string; markdown: string; onRestored: (v: NoteVersion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(next: boolean) {
    setOpen(next);
    if (!next) return;
    setVersions(null);
    try { setVersions(await listVersions(noteId)); } catch { setVersions([]); toast.error("Couldn't load version history."); }
  }

  async function restore(v: NoteVersion) {
    setBusy(v.id);
    try {
      await restoreVersion(noteId, v, { title, markdown });
      onRestored(v);
      toast.success("Restored. The version you replaced is saved in history too.");
      setOpen(false);
    } catch { toast.error("Couldn't restore that version."); } finally { setBusy(null); }
  }

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Version history"><History /></Button></DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>Earlier versions are saved as you write and kept until you delete the note for good.</DialogDescription>
        </DialogHeader>
        {versions === null && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {versions?.length === 0 && <p className="text-sm text-muted-foreground">No earlier versions yet. They appear as you edit.</p>}
        <ul className="space-y-2">
          {versions?.map((v) => (
            <li key={v.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">{new Date(v.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="text-xs text-muted-foreground">{v.reason === "before-restore" ? "before a restore" : v.reason === "before-ai" ? "before AI changes" : "autosave"}</span>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => restore(v)}>
                  {busy === v.id ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restore
                </Button>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{v.markdown.slice(0, 280)}</p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
