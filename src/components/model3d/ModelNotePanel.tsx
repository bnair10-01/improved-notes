import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDocs, query, where, writeBatch } from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { Maximize2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Doodle } from "@/components/fun/Doodle";
import { commit, newId, nowIso, userCol, userDoc } from "@/lib/db";
import { storage, db } from "@/lib/firebase";
import { requireUid } from "@/lib/db";
import { generateReferenceImage } from "@/lib/ai/illustrate";
import { signedUrls, uploadFile } from "@/lib/notes";
import { useQuery } from "@tanstack/react-query";

/** The picture for a concept note: loads it from the note's picture record. Old 3D notes with no picture get a gentle prompt to draw one. */
export async function loadPicture(noteId: string): Promise<{ url?: string; path?: string }> {
  const files = await getDocs(query(userCol("attachments"), where("note_id", "==", noteId)));
  const rec = files.docs.map((d) => d.data()).filter((a) => a["type"] === "model_reference").sort((a, b) => String(b["created_at"]).localeCompare(String(a["created_at"])))[0];
  if (!rec) return {};
  const path = rec["storage_path"] as string;
  const [url] = await signedUrls([path]);
  return { ...(url ? { url } : {}), path };
}

/** A concept note's picture, big and clear. Tap it to see it full size; "Draw again" makes a fresh one from the note. */
export function ModelNotePanel({ noteId, title, markdown }: { noteId: string; title: string; markdown: string }) {
  const qc = useQueryClient();
  const pic = useQuery({ queryKey: ["concept-picture", noteId], queryFn: () => loadPicture(noteId), staleTime: 20 * 60 * 1000 });
  const [big, setBig] = useState(false), [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function redraw() {
    if (busy) return;
    setBusy(true);
    try {
      const uid = requireUid();
      const picture = await generateReferenceImage(title, markdown.slice(0, 30000));
      const path = `users/${uid}/models/${noteId}/reference-${newId().slice(0, 8)}.${picture.mime.includes("jpeg") ? "jpg" : "png"}`;
      await uploadFile(path, Uint8Array.from(atob(picture.base64), (c) => c.charCodeAt(0)), picture.mime);
      const old = await getDocs(query(userCol("attachments"), where("note_id", "==", noteId)));
      const batch = writeBatch(db), oldPaths: string[] = [];
      old.docs.filter((d) => d.get("type") === "model_reference").forEach((d) => { oldPaths.push(d.get("storage_path")); batch.delete(d.ref); });
      batch.set(userDoc("attachments", newId()), { note_id: noteId, type: "model_reference", storage_path: path, position: 1, metadata: { mime_type: picture.mime, ai_generated: true }, created_at: nowIso() });
      await commit(batch.commit());
      await Promise.all(oldPaths.map((p) => deleteObject(storageRef(storage, p)).catch(() => undefined)));
      await qc.invalidateQueries({ queryKey: ["concept-picture", noteId] });
      toast.success("Drew a new picture");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't draw that. Please try again."); } finally { setBusy(false); }
  }
  useEffect(() => { started.current = false; }, [noteId]);

  if (pic.isPending) return <p role="status" className="paper-sheet p-4 text-sm text-muted-foreground">Loading the picture…</p>;
  if (pic.isError) return <p className="paper-sheet p-4 text-sm text-destructive">Couldn't load this picture.</p>;
  const { url } = pic.data;
  return (
    <figure data-concept-picture className="enter-pop overflow-hidden rounded-xl border bg-white">
      {url ? (
        <button type="button" onClick={() => setBig(true)} className="group relative block w-full" aria-label="View the picture full size">
          <img src={url} alt={`Picture of ${title}`} className="mx-auto max-h-[70dvh] w-full object-contain" />
          <span className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full border bg-background/90 text-foreground opacity-90 shadow"><Maximize2 className="h-4 w-4" /></span>
        </button>
      ) : (
        <div className="grid place-items-center gap-3 bg-card p-8 text-center text-sm text-muted-foreground"><Doodle kind="sketch" className="h-12 w-12 text-foreground" /><p>This note doesn't have a picture yet.</p></div>
      )}
      <figcaption className="flex flex-wrap items-center gap-2 border-t bg-card px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">Picture drawn by AI (Nano Banana). Simplified, not to scale.</span>
        <Button size="sm" variant="outline" className="min-h-10 sm:min-h-0" onClick={() => void redraw()} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} /> {url ? "Draw again" : "Draw a picture"}</Button>
      </figcaption>
      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="max-w-[96vw] p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">{title}</DialogTitle><DialogDescription className="sr-only">Full-size picture</DialogDescription>
          {url && <img src={url} alt={`Picture of ${title}`} className="mx-auto max-h-[88dvh] w-full rounded-md bg-white object-contain" />}
        </DialogContent>
      </Dialog>
    </figure>
  );
}
