import { takeCaptureTopic } from "@/lib/capture-context";
import { dialogFile } from "@/lib/dialogs";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { writeBatch } from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { commit, newId, nowIso, userDoc } from "@/lib/db";
import { uploadFile } from "@/lib/notes";
import { ensureSignedIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { slidesToMarkdown, validateDeckFile } from "@/lib/slides";
export function ImportSlidesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate(), query = useQueryClient();
  const [file, setFile] = useState<File | null>(() => { const f = dialogFile(); return f && !validateDeckFile(f) ? f : null; }), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  async function run() {
    if (!file || busy) return;
    const validation = validateDeckFile(file); if (validation) { toast.error(validation); return; }
    setBusy(true); setProgress(0); setStatus("Reading slides…");
    const noteId = newId(); const uploaded: string[] = [];
    try {
      const user = await ensureSignedIn();
      const { importDeck } = await import("@/lib/slides-import");
      const result = await importDeck(file, (done, total) => { setStatus(`Reading slide ${done} of ${total}`); setProgress(Math.round(done / total * 50)); });
      const attachments: { id: string; data: Record<string, unknown> }[] = [];
      for (const [index, item] of result.slides.entries()) {
        if (item.image) {
          const path = `users/${user.uid}/slides/${noteId}/${index}.jpg`;
          try { await uploadFile(path, item.image, "image/jpeg"); } catch { throw new Error("Couldn't upload a slide image. Please try again."); }
          uploaded.push(path); item.slide.imagePath = path;
          attachments.push({ id: newId(), data: { note_id: noteId, type: "slide_image", storage_path: path, position: index, metadata: { text: [item.slide.title, ...item.slide.bullets].join("\n"), image_only: item.slide.bullets.length === 0 && item.slide.title === `Slide ${index + 1}` }, created_at: nowIso() } });
        }
        setStatus(`Saving slide ${index + 1} of ${result.slides.length}`); setProgress(50 + Math.round((index + 1) / result.slides.length * 45));
      }
      // One atomic write: the deck and its image records appear together or not at all.
      const now = nowIso(), batch = writeBatch(db);
      batch.set(userDoc("notes", noteId), { title: file.name.replace(/\.(pdf|pptx)$/i, ""), markdown: slidesToMarkdown(result.slides.map((s) => s.slide)), kind: "slides", folder_id: takeCaptureTopic(), tags: [], pinned: false, deleted_at: null, source_note_ids: [], created_at: now, updated_at: now, rev: 1 });
      for (const a of attachments) batch.set(userDoc("attachments", a.id), a.data);
      try { await commit(batch.commit()); } catch { throw new Error("Couldn't save this deck."); }
      setProgress(100);
      if (result.warnings) toast.warning(`${result.warnings} embedded image(s) couldn't be imported. Text was preserved; export to PDF for full fidelity.`);
      toast.success(`Imported ${result.slides.length} slides`); onOpenChange(false); setFile(null);
      await navigate({ to: "/vault/$noteId", params: { noteId } });
    } catch (e) {
      // Nothing was saved, so only the files uploaded by this attempt are removed.
      await Promise.allSettled(uploaded.map((p) => deleteObject(storageRef(storage, p))));
      toast.error(e instanceof Error && !/zip|InvalidPDF|Invalid XML/i.test(e.message) ? e.message : "This file couldn't be read. Try exporting an unlocked PDF and importing it again.");
    } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}><DialogContent className="max-w-md" onInteractOutside={(e) => { if (busy) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
    <DialogHeader><DialogTitle>Import presentation</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">PDF or PPTX · up to 50 MB and 100 slides.</p>
    <label className="grid gap-2 text-sm">Presentation file<input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={busy} onChange={(e) => { const next = e.target.files?.[0] ?? null; if (next) { const error = validateDeckFile(next); if (error) { toast.error(error); e.target.value = ""; setFile(null); return; } } setFile(next); }} className="min-w-0 w-full rounded-md border p-2 file:mr-2" /></label>
    {file && <p className="break-all text-sm" data-chosen-file>{file.name}</p>}
    <p className="text-sm text-muted-foreground">Complex layouts may not match — export to PDF for full fidelity. PPTX imports retain text and the first embedded image on each slide.</p>
    {busy && <div className="space-y-2" role="status" aria-live="polite"><p className="text-sm">{status}</p><progress className="w-full accent-primary" max={100} value={progress} aria-label="Import progress" /></div>}
    <Button disabled={!file || busy} onClick={run}>{busy ? "Importing…" : "Import slides"}</Button>
  </DialogContent></Dialog>;
}
