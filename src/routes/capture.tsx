import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, FileText, ImagePlus, Loader2, Network, RotateCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { Hint } from "@/components/shell/Hint";
import { prepareImage, rotateDataUrl } from "@/lib/image";
import { getSession, resetSession, setSession, useSession } from "@/lib/session";
import { transcribeNotes } from "@/lib/ai/tasks";
import { ensureSignedIn, useAuth } from "@/lib/auth";
import { UrlCapture } from "@/components/capture/UrlCapture";
import { openDialog } from "@/lib/dialogs";
import { createNote, useRefreshVault, useVault } from "@/lib/vault";

export const Route = createFileRoute("/capture")({
  component: CapturePage,
});

type Method = "scan" | "write" | "voice" | "lecture" | "website" | "pdf" | "slides" | "youtube";
const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "scan", label: "Scan or photo", hint: "Handwriting becomes text" },
  { id: "write", label: "Write", hint: "Type a note" },
  { id: "voice", label: "Voice memo", hint: "Record or upload" },
  { id: "lecture", label: "Lecture", hint: "A long recording" },
  { id: "website", label: "Website", hint: "Paste a link" },
  { id: "pdf", label: "PDF", hint: "Pages become notes" },
  { id: "slides", label: "Slides", hint: "PowerPoint or PDF" },
  { id: "youtube", label: "YouTube", hint: "Paste a link" },
];

function CapturePage() {
  const { pages, mode = "text" } = useSession();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const transcribe = transcribeNotes;
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const [method, setMethod] = useState<Method>("scan");
  const [folderId, setFolderId] = useState<string>("");
  const { data: vault } = useVault();
  const refresh = useRefreshVault();

  async function choose(m: Method) {
    setMethod(m);
    if (m === "voice" || m === "lecture") openDialog("audio");
    else if (m === "pdf" || m === "slides") openDialog("slides");
    else if (m === "write") {
      try {
        const id = await createNote({ kind: "text", title: "Untitled", folder_id: folderId || null });
        await refresh();
        navigate({ to: "/vault/$noteId", params: { noteId: id } });
      } catch { toast.error("Couldn't create the note."); }
    }
  }

  // Opening Capture after a note was already transcribed starts a new scan, not the old photos.
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
      setSession({ result: res.result, mode, noteId: null, mindmap: null, mindmapStale: false, diagrams: [] });
      navigate({ to: "/review" });
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
        <h1 className="font-serif text-3xl font-normal tracking-tight sm:text-4xl">Capture</h1>
        <p className="mt-1 text-sm text-muted-foreground">One place for everything you want to remember. Pick how, and a topic if you like.</p>
        <div role="radiogroup" aria-label="Capture method" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((m, i) => (
            <button key={m.id} type="button" role="radio" aria-checked={method === m.id} onClick={() => void choose(m.id)}
              className={`flex flex-col gap-4 rounded-xl border p-3 text-left transition-colors hover:bg-card/70 ${method === m.id ? "border-foreground bg-card" : ""}`}>
              <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span><span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-muted-foreground">{m.hint}</span></span>
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          Topic <span className="text-xs">(optional)</span>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" aria-label="Topic">
            <option value="">None. I'll file it later</option>
            {(vault?.folders ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        {(method === "voice" || method === "lecture") && <div className="paper-sheet mt-5 p-4 text-sm"><p className="text-muted-foreground">Recordings are transcribed in the cloud.</p><Button className="mt-3" onClick={() => openDialog("audio")}>Open the recorder</Button></div>}
        {(method === "pdf" || method === "slides") && <div className="paper-sheet mt-5 p-4 text-sm"><p className="text-muted-foreground">Each page or slide becomes part of one note.</p><Button className="mt-3" onClick={() => openDialog("slides")}>Choose a file</Button></div>}
        {(method === "website" || method === "youtube") && <UrlCapture kind={method} folderId={folderId || null} />}
        {method === "scan" && <div className="mt-4"><Hint id="capture">Tip: shoot pages flat in good light. Use the arrows to fix the order before you transcribe.</Hint></div>}
        {method === "scan" && ready && user && (
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

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-muted-foreground">What do you want back?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "text", icon: FileText, label: "Just the text", hint: "Clean transcript, tables kept, save as PDF" },
              { v: "map", icon: Network, label: "Text + mind map", hint: "Also a 3D map and redrawn sketches" },
            ] as const).map(({ v, icon: Icon, label, hint }) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => setSession({ mode: v })}
                className={`paper-sheet flex flex-col items-start gap-1 p-3 text-left transition-colors ${mode === v ? "border-primary ring-2 ring-primary/30" : "opacity-80 hover:opacity-100"}`}>
                <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-4 w-4 text-primary" /> {label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

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
