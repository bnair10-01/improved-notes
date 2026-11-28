import { Working } from "@/components/fun/Doodle";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { Hint } from "@/components/shell/Hint";
import { prepareImage, rotateDataUrl } from "@/lib/image";
import { getSession, resetSession, setSession, useSession } from "@/lib/session";
import { transcribeNotes } from "@/lib/ai/tasks";
import { ensureSignedIn, rememberNext, useAuth } from "@/lib/auth";
import { saveNote } from "@/lib/notes";

export const Route = createFileRoute("/scan")({
  component: ScanPage,
});

/** Scan handwriting: take or choose photos, put them in order, and turn them into a note. Reached from the Add menu. */
function ScanPage() {
  const { pages } = useSession();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const transcribe = transcribeNotes;
  const navigate = useNavigate();
  const { user, ready } = useAuth();

  // Opening Scan after a note was already transcribed starts a new scan, not the old photos.
  useEffect(() => { if (getSession().result) resetSession(); }, []);

  // Scanning works without an account: a guest session is created and linked to a real sign-in later.
  useEffect(() => { ensureSignedIn().catch((e) => console.warn("Guest session unavailable", e)); }, []);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list);
    const bad = files.filter((f) => !f.type.startsWith("image/"));
    if (bad.length) toast.error(`${bad.length} file(s) skipped — only images are supported.`);
    const added = [];
    for (const f of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        added.push({ id: crypto.randomUUID(), dataUrl: await prepareImage(f) });
      } catch {
        toast.error(`Couldn't read ${f.name}`);
      }
    }
    if (added.length) setSession({ pages: [...pages, ...added], result: null, noteId: null });
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...pages];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSession({ pages: next });
  }

  async function rotate(i: number) {
    const p = pages[i];
    if (!p) return;
    const dataUrl = await rotateDataUrl(p.dataUrl);
    setSession({ pages: pages.map((x, k) => (k === i ? { ...x, dataUrl } : x)) });
  }

  async function run() {
    setBusy(true);
    try {
      const res = await transcribe({ images: pages.map((p) => p.dataUrl) });
      if (!res.ok) { toast.error(res.error); return; }
      // Always saved, straight away: scanning is making a note, and a note is never left to be saved by hand.
      // The mind map is built next on the review screen and saved onto the same note.
      const me = await ensureSignedIn();
      const noteId = await saveNote(null, pages, res.result);
      setSession({ result: res.result, mode: "map", noteId, mindmap: null, mindmapStale: false, diagrams: [] });
      if (me.isAnonymous) {
        const next = `/review?id=${noteId}`;
        toast.success("Saved as a guest. Sign in to keep it on all your devices.", { action: { label: "Sign in", onClick: () => { rememberNext(next); navigate({ to: "/auth", search: { redirect: next } }); } } });
      }
      navigate({ to: "/review", search: { id: noteId } });
    } catch {
      toast.error("Couldn't reach the transcriber. Try fewer pages or try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-5 sm:py-10">
        <h1 className="font-serif text-3xl font-normal tracking-tight sm:text-4xl">Scan handwriting</h1>
        <p className="mt-1 text-sm text-muted-foreground">Photograph your pages. They become one note you can edit, summarise and study.</p>
        <div className="mt-4"><Hint id="capture">Tip: shoot pages flat in good light, then use the arrows to fix the order before you transcribe. Want a recording, slides or a link instead? Use Add in the top bar.</Hint></div>
        {ready && user && (
        <>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          className={`paper-sheet mt-6 flex flex-col items-center justify-center gap-4 border-2 border-dashed px-4 py-8 sm:mt-8 sm:px-6 sm:py-12 text-center transition-colors ${dragging ? "border-primary bg-accent" : "border-border"}`}
        >
          <ImagePlus className="hidden h-10 w-10 text-muted-foreground sm:block" />
          <p className="hidden text-sm text-muted-foreground sm:block">Drop note photos here</p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:justify-center">
            <Button onClick={() => camRef.current?.click()}><Camera /> Take photo</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus /> Choose files</Button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        <p className="mt-5 text-sm text-muted-foreground">You get the transcript and a mind map, saved to your notes as soon as it's ready.</p>

        {pages.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">{pages.length} page{pages.length > 1 ? "s" : ""}</h2>
              <Button variant="ghost" size="sm" onClick={() => setSession({ pages: [], result: null, noteId: null })}>Clear all</Button>
            </div>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
              {pages.map((p, i) => (
                <li key={p.id} className="paper-sheet overflow-hidden">
                  <div className="relative aspect-[3/4] bg-muted">
                    <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-full w-full object-contain" />
                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">{i + 1}</span>
                  </div>
                  <div className="flex items-center justify-between p-1">
                    <Button variant="ghost" size="icon" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}><ArrowLeft /></Button>
                    <Button variant="ghost" size="icon" aria-label="Rotate" onClick={() => rotate(i)}><RotateCw /></Button>
                    <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setSession({ pages: pages.filter((x) => x.id !== p.id) })}><X /></Button>
                    <Button variant="ghost" size="icon" aria-label="Move later" disabled={i === pages.length - 1} onClick={() => move(i, 1)}><ArrowRight /></Button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="fixed inset-x-0 bottom-[var(--tabbar)] z-20 border-t bg-background/85 p-3 backdrop-blur-md sm:sticky sm:bottom-4 sm:mt-8 sm:flex sm:justify-center sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              {busy && <div className="mb-3 rounded-xl border bg-card p-3 shadow-lg sm:absolute sm:bottom-full sm:mb-3 sm:w-96"><Working kind="scan" quips="scan" steps={["Looking at your pages…", "Reading the handwriting…", "Marking anything unclear…", "Tidying it into notes…"]} /></div>}
              <Button size="lg" onClick={run} disabled={busy} className="w-full shadow-lg sm:w-auto">
                {busy ? <><Loader2 className="animate-spin" /> Transcribing…</> : <><Sparkles /> Transcribe</>}
              </Button>
            </div>
          </section>
        )}
        </>
        )}
      </main>
    </div>
  );
}
