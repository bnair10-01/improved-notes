import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Box, Camera, FileText, Globe, Mic, Paperclip, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setCaptureTopic } from "@/lib/capture-context";
import { openDialog } from "@/lib/dialogs";
import { prepareImage } from "@/lib/image";
import { setSession } from "@/lib/session";
import { validateDeckFile } from "@/lib/slides";
import { createNote, useRefreshVault } from "@/lib/vault";

export const ACCEPT = "image/*,.pdf,.pptx,application/pdf,.mp3,.m4a,.wav,.webm,.ogg,audio/*,.txt,.md,text/plain,text/markdown";

/**
 * Bring a file in: photos go to Scan; PDFs and slides, and audio, open their import with the file already chosen;
 * text files become notes. Used by the Add menu, by dropping on Home, and by pasting.
 */
export function useBringIn(onBusy?: (what: string | null) => void) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  return async function bringIn(list: FileList | File[] | null, folderId: string | null = null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setCaptureTopic(folderId);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      onBusy?.("files");
      try {
        const pages = await Promise.all(images.map(async (f) => ({ id: crypto.randomUUID(), dataUrl: await prepareImage(f) })));
        setSession({ pages, result: null, noteId: null });
        navigate({ to: "/scan" });
      } catch { toast.error("Couldn't read that photo."); onBusy?.(null); }
      return;
    }
    const f = files[0]!;
    if (/\.(pdf|pptx)$/i.test(f.name) || f.type === "application/pdf") {
      const err = validateDeckFile(f);
      if (err) { toast.error(err); return; }
      openDialog("slides", f);
    } else if (f.type.startsWith("audio/") || /\.(mp3|m4a|wav|webm|ogg)$/i.test(f.name)) {
      openDialog("audio", f);
    } else if (f.type.startsWith("text/") || /\.(txt|md)$/i.test(f.name)) {
      const body = await f.text();
      onBusy?.("note");
      try {
        const id = await createNote({ kind: "text", title: f.name.replace(/\.(txt|md)$/i, ""), markdown: body, folder_id: folderId });
        await refresh();
        navigate({ to: "/vault/$noteId", params: { noteId: id } });
      } catch { toast.error("Couldn't import that file."); onBusy?.(null); }
    } else toast.error("That file type isn't supported. Try a photo, a PDF or slides, audio, or a text file.");
  };
}

const row = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-secondary active:bg-secondary";

/**
 * The one list of everything you can add, shared by the Home box, the top bar, the phone's + button, the notes list
 * and topic pages. Inside a topic, whatever you add lands in that topic.
 */
export function AddItems({ onDone, folderId = null, onBusy }: { onDone?: () => void; folderId?: string | null; onBusy?: (what: string | null) => void }) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const bringIn = useBringIn(onBusy);
  const picker = useRef<HTMLInputElement>(null);
  const go = (fn: () => void) => () => { setCaptureTopic(folderId); onDone?.(); fn(); };

  async function newNote() {
    try {
      const id = await createNote({ kind: "text", title: "Untitled", folder_id: folderId });
      await refresh();
      navigate({ to: "/vault/$noteId", params: { noteId: id } });
    } catch { toast.error("Couldn't create the note."); }
  }

  return (
    <div role="menu" aria-label="Add" data-add-menu>
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 0 } as CSSProperties} onClick={go(() => void newNote())}><SquarePen className="h-4 w-4 shrink-0" /> Write a note</button>
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 1 } as CSSProperties} onClick={go(() => navigate({ to: "/scan" }))}><Camera className="h-4 w-4 shrink-0" /> Scan handwriting</button>
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 2 } as CSSProperties} onClick={go(() => openDialog("audio"))}><Mic className="h-4 w-4 shrink-0" /> Voice or lecture</button>
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 3 } as CSSProperties} onClick={go(() => openDialog("slides"))}><FileText className="h-4 w-4 shrink-0" /> PDF or slides</button>
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 4 } as CSSProperties} onClick={go(() => openDialog("link"))}><Globe className="h-4 w-4 shrink-0" /> Website or YouTube link</button>
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 5 } as CSSProperties} onClick={go(() => picker.current?.click())}><Paperclip className="h-4 w-4 shrink-0" /> Upload a file…</button>
      <div className="my-1 border-t" role="separator" />
      <button role="menuitem" className={`${row} enter-pop`} style={{ "--i": 6 } as CSSProperties} onClick={go(() => openDialog("model"))}><Box className="h-4 w-4 shrink-0" /> 3D model of a concept</button>
      <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void bringIn(e.target.files, folderId); e.target.value = ""; }} />
    </div>
  );
}

/** The list in a popover, opened by whatever button you pass in. */
export function AddPopover({ children, folderId = null, align = "end", onBusy }: { children: ReactNode; folderId?: string | null; align?: "start" | "center" | "end"; onBusy?: (what: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-1.5"><AddItems folderId={folderId} onDone={() => setOpen(false)} {...(onBusy ? { onBusy } : {})} /></PopoverContent>
    </Popover>
  );
}
