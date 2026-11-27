import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, FileText, Globe, Mic, Play, Scissors } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UrlCapture } from "@/components/capture/UrlCapture";
import { setCaptureTopic } from "@/lib/capture-context";
import { openDialog } from "@/lib/dialogs";
import { openSplit } from "@/lib/split-events";
import { words } from "@/lib/retrieve";
import { useVault, type VNote } from "@/lib/vault";

const btn = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50";

/** Everything you can bring into your notes, right where you are writing. Anything added lands in this note's topic. */
export function NoteTools({ note, markdown }: { note: VNote; markdown: string }) {
  const navigate = useNavigate();
  const { data: vault } = useVault();
  const [urlKind, setUrlKind] = useState<"website" | "youtube" | null>(null);
  const folderName = note.folder_id ? vault?.folders.find((f) => f.id === note.folder_id)?.name : undefined;
  const longEnough = words(markdown).length >= 60;
  const go = (fn: () => void) => () => { setCaptureTopic(note.folder_id); fn(); };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Add to your notes" data-note-tools>
      <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Add</span>
      <button className={btn} onClick={go(() => navigate({ to: "/scan" }))}><Camera className="h-3.5 w-3.5" />Scan</button>
      <button className={btn} onClick={go(() => openDialog("audio"))}><Mic className="h-3.5 w-3.5" />Voice or lecture</button>
      <button className={btn} onClick={go(() => openDialog("slides"))}><FileText className="h-3.5 w-3.5" />PDF or slides</button>
      <button className={btn} onClick={() => setUrlKind("website")}><Globe className="h-3.5 w-3.5" />Website</button>
      <button className={btn} onClick={() => setUrlKind("youtube")}><Play className="h-3.5 w-3.5" />YouTube</button>
      <button className={btn} onClick={() => openSplit(note.id)} disabled={!longEnough} title={longEnough ? "Cut this note into separate notes, one idea each" : "Needs a longer note"}><Scissors className="h-3.5 w-3.5" />Split into notes</button>
      <Dialog open={!!urlKind} onOpenChange={(o) => !o && setUrlKind(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{urlKind === "youtube" ? "Add a YouTube video" : "Add a website"}</DialogTitle>
            <DialogDescription>{folderName ? `It will be divided into notes and added to “${folderName}”, or a new topic if you prefer.` : "It will be divided into separate notes under a topic you name."}</DialogDescription>
          </DialogHeader>
          {urlKind && <UrlCapture kind={urlKind} folderId={note.folder_id} {...(folderName ? { folderName } : {})} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
