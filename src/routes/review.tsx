import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronLeft, ChevronRight, Copy, Download, FileText, Image as ImageIcon, Loader2, ImagePlus, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportPdf } from "@/lib/pdf";
import { toast } from "sonner";
import { ReadAloud } from "@/components/shell/ReadAloud";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AppHeader } from "@/components/AppHeader";
import { InsightColumn } from "@/components/vault/InsightColumn";
import { InferenceBadge } from "@/components/shell/InferenceBadge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useVault, type VNote } from "@/lib/vault";
import { getDoc } from "firebase/firestore";
import { userDoc } from "@/lib/db";
import { prepareImage, urlToDataUrl } from "@/lib/image";
import { LocalGraph } from "@/components/vault/LocalGraph";
import { saveDiagrams, saveMindmap, saveNote, signedUrls } from "@/lib/notes";
import { extractDiagrams } from "@/lib/ai/tasks";
import type { Diagram } from "@/lib/diagram-types";
import { generateMindmap } from "@/lib/ai/tasks";
import { isMindMap, type MindMap } from "@/lib/mindmap-types";

const DiagramsPanel = lazy(() => import("@/components/diagrams/DiagramsPanel"));
const MindMapView = lazy(() => import("@/components/mindmap/MindMapView"));
import { remarkUncertain, UNCERTAIN_RE } from "@/lib/remark-uncertain";
import { setSession, useSession } from "@/lib/session";
import { ensureSignedIn, rememberNext } from "@/lib/auth";
import { transcribeNotes } from "@/lib/ai/tasks";
import type { NoteStructure } from "@/lib/types";

type Search = { id?: string };

export const Route = createFileRoute("/review")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s["id"] === "string" ? { id: s["id"] } : {}),
  head: () => ({
    meta: [
      { title: "Review transcript — Improved Notes" },
      { name: "description", content: "Compare your handwritten pages with the transcript, fix unclear words, and export." },
      { property: "og:title", content: "Review transcript — Improved Notes" },
      { property: "og:description", content: "Side-by-side review of handwritten notes and their clean transcript." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toPlain(md: string) {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.*?)\*/g, "$1$2")
    .replace(/^>\s?/gm, "")
    .replace(/`([^`]*)`/g, "$1");
}

/** A small, quiet reminder that it's kept. */
function SavedMark({ saved }: { saved: boolean }) {
  return saved ? <span data-saved className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Check className="h-3.5 w-3.5" /> Saved</span> : null;
}

function ReviewPage() {
  const { id } = Route.useSearch();
  const session = useSession();
  const navigate = useNavigate();
  const transcribe = transcribeNotes;
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"retranscribe" | "save" | "add" | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [title, setTitle] = useState(session.result?.title ?? "");
  const [markdown, setMarkdown] = useState(session.result?.markdown ?? "");
  const [tab, setTab] = useState("preview");
  const [pane, setPane] = useState<"text" | "photo">("text");
  const { data: vault } = useVault();
  const [insightOpen, setInsightOpen] = useState(false);
  const [mmLoading, setMmLoading] = useState(false);
  const mapper = generateMindmap;
  const autoTried = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [pendingSnippet, setPendingSnippet] = useState<string | null>(null);
  const mindmap = session.mindmap ?? null;
  const diagrams = session.diagrams ?? [];
  const finder = extractDiagrams;
  const [finding, setFinding] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains("dark"));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  function onDiagramsChange(d: Diagram[]) {
    setSession({ diagrams: d });
    if (session.noteId) saveDiagrams(session.noteId, d).catch(() => toast.error("Couldn't save the drawing."));
  }

  async function findDrawings() {
    setFinding(true);
    try {
      const images = await Promise.all(session.pages.map((p) => (p.dataUrl.startsWith("data:") ? p.dataUrl : urlToDataUrl(p.dataUrl))));
      const res = await finder({ images, markdown });
      if (!res.ok) { toast.error(res.error); return; }
      if (!res.diagrams.length) { toast("No drawings found on these pages."); return; }
      const { fromAi } = await import("@/components/diagrams/DiagramsPanel");
      onDiagramsChange(fromAi(res.diagrams));
      toast.success(`Redrew ${res.diagrams.length} drawing${res.diagrams.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn't redraw the sketches. Please try again.");
    } finally {
      setFinding(false);
    }
  }
  const stale = !!session.mindmapStale;

  const persistMindmap = useCallback((m: MindMap | null, isStale: boolean) => {
    const noteId = session.noteId;
    if (!noteId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMindmap(noteId, m, isStale).catch(() => toast.error("Couldn't auto-save the mind map."));
    }, 800);
  }, [session.noteId]);

  const runMindmap = useCallback(async (md: string) => {
    setMmLoading(true);
    try {
      const res = await mapper({ markdown: md });
      if (!res.ok) { toast.error(res.error); return; }
      setSession({ mindmap: res.mindmap, mindmapStale: false });
      persistMindmap(res.mindmap, false);
    } catch {
      toast.error("Couldn't build the mind map. Please try again.");
    } finally {
      setMmLoading(false);
    }
  }, [mapper, persistMindmap]);

  // Generate automatically after a fresh transcription.
  // Every scan gets a mind map, built automatically and saved onto its note (also for an older scan that never had one).
  useEffect(() => { autoTried.current = false; }, [id]);
  useEffect(() => {
    if (autoTried.current || !session.result || session.mindmap || !session.result.markdown.trim() || (id && session.noteId !== id)) return;
    autoTried.current = true;
    void runMindmap(session.result.markdown);
  }, [id, session.noteId, session.result, session.mindmap, runMindmap]);

  function onMindmapChange(m: MindMap) {
    setSession({ mindmap: m });
    persistMindmap(m, stale);
  }

  function onMarkdownChange(v: string) {
    setMarkdown(v);
    if (mindmap && !stale) {
      setSession({ mindmapStale: true });
      persistMindmap(null, true);
    }
  }

  function showSource(snippet: string) {
    setTab("preview");
    setPendingSnippet(snippet);
  }

  // Highlight and scroll to a node's source text in the Preview.
  useEffect(() => {
    if (!pendingSnippet || tab !== "preview") return;
    const t = setTimeout(() => {
      const root = articleRef.current;
      const hl = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
      if (!root) return;
      const needle = pendingSnippet.trim().toLowerCase();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const parts: { node: Text; start: number }[] = [];
      let full = "";
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { parts.push({ node: n as Text, start: full.length }); full += n.textContent ?? ""; }
      let at = full.toLowerCase().indexOf(needle);
      let len = needle.length;
      if (at < 0) { const w = needle.split(/\s+/).slice(0, 3).join(" "); at = full.toLowerCase().indexOf(w); len = w.length; }
      if (at < 0) { toast("Couldn't find that text in the transcript."); setPendingSnippet(null); return; }
      const locate = (pos: number) => { const p = [...parts].reverse().find((x) => x.start <= pos)!; return { node: p.node, off: pos - p.start }; };
      const a = locate(at), b = locate(at + len);
      const range = document.createRange();
      range.setStart(a.node, a.off);
      range.setEnd(b.node, Math.min(b.off, b.node.length));
      a.node.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      const H = (globalThis as { Highlight?: new (r: Range) => unknown }).Highlight;
      if (hl && H) hl.set("source-snippet", new H(range));
      setPendingSnippet(null);
    }, 80);
    return () => clearTimeout(t);
  }, [pendingSnippet, tab]);

  // Load a saved note when opened from History.
  useEffect(() => {
    if (!id || session.noteId === id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      await ensureSignedIn();
      const snap = await getDoc(userDoc("notes", id)).catch(() => null);
      type Saved = { title: string; markdown: string; image_paths: string[]; structure: unknown; diagrams: unknown[]; mindmap_stale: boolean };
      const data = snap?.exists() ? ({ image_paths: [], diagrams: [], mindmap_stale: false, structure: null, ...snap.data() } as unknown as Saved) : null;
      if (cancelled) return;
      if (!data) {
        toast.error("Couldn't open that note.");
        setLoading(false);
        return;
      }
      const urls = await signedUrls(data.image_paths);
      const pages = urls.map((u, i) => ({ id: `${id}-${i}`, dataUrl: u, path: data.image_paths[i] ?? "" }));
      const structure = (data.structure as unknown as NoteStructure) ?? { nodes: [], edges: [] };
      const saved = isMindMap(data.structure) ? (data.structure as unknown as MindMap) : null;
      setSession({ noteId: id, mode: "map", pages, diagrams: (data.diagrams as unknown as Diagram[]) ?? [], mindmap: saved, mindmapStale: data.mindmap_stale, result: { title: data.title, markdown: data.markdown, uncertain_spans: [], structure: saved ? { nodes: [], edges: [] } : structure } });
      setTitle(data.title);
      setMarkdown(data.markdown);
      setPage(0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, session.noteId]);

  const pages = session.pages;
  const current = pages[Math.min(page, pages.length - 1)];
  const flagged = (markdown.match(UNCERTAIN_RE) ?? []).length;

  /** Keep the note up to date as it changes. Saving is never something to remember to do. */
  async function persist() {
    if (!session.result || !session.noteId) return;
    try {
      const result = { ...session.result, title: title || "Untitled notes", markdown };
      await saveNote(session.noteId, pages, result, mindmap, stale, diagrams);
      setSession({ result });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save your changes. They're still here; we'll try again as you keep going.");
    }
  }
  // Title, text and added pages save a moment after you stop changing them.
  useEffect(() => {
    const r = session.result;
    if (!r || !session.noteId) return;
    if (title === r.title && markdown === r.markdown && pages.every((p) => p.path)) return;
    const t = setTimeout(() => void persist(), 1200);
    return () => clearTimeout(t);
  }, [title, markdown, pages.length, session.noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (<div className="min-h-screen"><AppHeader /><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></div>);
  }

  if (!session.result) {
    return (
      <div className="min-h-screen"><AppHeader />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="font-serif text-2xl font-semibold">Nothing to review yet</h1>
          <p className="mt-2 text-muted-foreground">Add some note photos and transcribe them first.</p>
          <Button asChild className="mt-6"><Link to="/scan">Scan notes</Link></Button>
        </div>
      </div>
    );
  }

  async function retranscribe() {
    setBusy("retranscribe");
    try {
      const images = await Promise.all(pages.map((p) => (p.dataUrl.startsWith("data:") ? p.dataUrl : urlToDataUrl(p.dataUrl))));
      const res = await transcribe({ images });
      if (!res.ok) { toast.error(res.error); return; }
      setSession({ result: res.result });
      setTitle(res.result.title);
      setMarkdown(res.result.markdown);
      toast.success("Transcribed again");
    } catch {
      toast.error("Couldn't re-transcribe. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function addPhotos(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) { if (list?.length) toast.error("Only images are supported."); return; }
    setBusy("add");
    try {
      const added = await Promise.all(files.map(async (f) => ({ id: crypto.randomUUID(), dataUrl: await prepareImage(f) })));
      const res = await transcribe({ images: added.map((a) => a.dataUrl) });
      if (!res.ok) { toast.error(res.error); return; }
      const nextMd = `${markdown.trimEnd()}\n\n---\n\n${res.result.markdown}`;
      setSession({ pages: [...pages, ...added], result: { ...session.result!, markdown: nextMd }, mindmapStale: !!mindmap });
      setMarkdown(nextMd);
      setPage(pages.length);
      toast.success(`Added ${added.length} page${added.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Couldn't add those photos. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function pdf() {
    const html = articleRef.current?.innerHTML;
    if (!html) { setTab("preview"); toast("Opening the transcript… tap PDF again."); return; }
    if (!exportPdf(title || "Notes", html)) toast.error("Allow pop-ups to save the PDF.");
  }

  const fileBase = (title || "notes").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "notes";

  const nowIso = new Date().toISOString();
  const savedNote = vault?.notes.find((n) => n.id === session.noteId);
  const insightNote: VNote = { id: session.noteId ?? "draft", kind: "handwritten", folder_id: null, tags: [], pinned: false, deleted_at: null, updated_at: nowIso, created_at: nowIso, source_note_ids: [], ...savedNote, title: title || "Untitled notes", markdown };
  const insight = (
    <InsightColumn note={insightNote} vault={vault ?? { notes: [], folders: [], links: [] }} markdown={markdown} saved={!!session.noteId}
      onOpenGraph={() => { setTab("mindmap"); setInsightOpen(false); }} />
  );

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-[1560px] gap-4 px-3 py-3 sm:px-4 sm:py-6">
        <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="h-auto min-w-0 flex-1 border-transparent bg-transparent px-0 font-serif text-xl font-semibold shadow-none focus-visible:border-input focus-visible:px-2 sm:text-2xl md:text-2xl" />
          <InferenceBadge className="hidden sm:inline-flex" />
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setInsightOpen(true)}>Insight</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Export and more"><Download /><span className="hidden sm:inline">Export</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={pdf}><FileText /> PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => download(`${fileBase}.md`, markdown, "text/markdown")}><Download /> Markdown (.md)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => download(`${fileBase}.txt`, toPlain(markdown), "text/plain")}><Download /> Plain text (.txt)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(markdown).then(() => toast.success("Copied"))}><Copy /> Copy text</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={retranscribe} disabled={!!busy}><RefreshCw /> Re-transcribe</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SavedMark saved={!!session.noteId} />
        </div>

        <div className="mb-3 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm lg:hidden" role="tablist" aria-label="Show">
          {(["text", "photo"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={pane === v} onClick={() => setPane(v)} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition-colors ${pane === v ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {v === "text" ? <><FileText className="h-4 w-4" /> Transcript</> : <><ImageIcon className="h-4 w-4" /> Photos{pages.length > 1 ? ` (${pages.length})` : ""}</>}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={`paper-sheet flex-col overflow-hidden lg:flex ${pane === "photo" ? "flex" : "hidden"}`}>
            <div className="flex items-center justify-between border-b px-2 py-1.5 sm:px-3 sm:py-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
                <span className="text-sm text-muted-foreground">Page {Math.min(page + 1, pages.length)} of {pages.length}</span>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pages.length - 1} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" aria-label="Add photos" disabled={!!busy} onClick={() => addRef.current?.click()}>
                  {busy === "add" ? <Loader2 className="animate-spin" /> : <ImagePlus />}<span className="hidden sm:inline">Add</span>
                </Button>
                <input ref={addRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}><ZoomOut /></Button>
                <span className="w-10 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom + 0.5))}><ZoomIn /></Button>
              </div>
            </div>
            <div className="h-[calc(100dvh-13rem-var(--tabbar))] overflow-auto bg-muted lg:h-[70vh]">
              {current && <img src={current.dataUrl} alt={`Original page ${page + 1}`} style={{ width: `${zoom * 100}%` }} className="mx-auto block max-w-none" />}
            </div>
          </section>

          <section className={`paper-sheet flex-col overflow-hidden lg:flex ${pane === "text" ? "flex" : "hidden"}`}>
            <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col gap-0">
              <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5 sm:px-3 sm:py-2">
                <TabsList className="max-w-full overflow-x-auto">
                  <TabsTrigger value="preview">Read</TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="mindmap">Map</TabsTrigger>
                </TabsList>
                <div className="flex shrink-0 items-center gap-2">
                  {flagged > 0 && <span className="uncertain-mark whitespace-nowrap text-xs">{flagged} to check</span>}
                </div>
              </div>
              <TabsContent value="preview" className="m-0 h-[calc(100dvh-13rem-var(--tabbar))] overflow-auto px-4 py-4 sm:px-5 lg:h-[70vh]">
                <div className="mb-3"><ReadAloud text={markdown} /></div>
                <article ref={articleRef} className="transcript">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkUncertain]}>{markdown}</ReactMarkdown>
                </article>
                {(
                  <div className="mt-6 border-t pt-4">
                    <h2 className="mb-2 font-serif text-lg font-semibold">Drawings</h2>
                    <ClientOnly fallback={<Skeleton className="h-40 w-full" />}>
                      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                        <DiagramsPanel diagrams={diagrams} onChange={onDiagramsChange} onFind={findDrawings} finding={finding} dark={dark} canFind={pages.length > 0} />
                      </Suspense>
                    </ClientOnly>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="edit" className="m-0 h-[calc(100dvh-13rem-var(--tabbar))] lg:h-[70vh]">
                <Textarea value={markdown} onChange={(e) => onMarkdownChange(e.target.value)} className="h-full resize-none rounded-none border-0 bg-transparent px-5 py-4 font-mono text-sm shadow-none focus-visible:ring-0" aria-label="Transcript markdown" />
              </TabsContent>
              <TabsContent value="mindmap" className="m-0 flex h-[calc(100dvh-13rem-var(--tabbar))] flex-col lg:h-[70vh]">
                {stale && mindmap && !mmLoading && (
                  <div className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2 text-sm">
                    <span>Notes changed. Regenerate?</span>
                    <Button size="sm" variant="outline" onClick={() => runMindmap(markdown)}><RefreshCw /> Regenerate</Button>
                  </div>
                )}
                {mmLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6" aria-label="Building mind map">
                    <Skeleton className="h-12 w-48 rounded-2xl" />
                    <div className="flex gap-6"><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-32" /></div>
                    <div className="flex gap-4"><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-24" /></div>
                    <p className="text-sm text-muted-foreground">Building your mind map…</p>
                  </div>
                ) : mindmap ? (
                  <div className="min-h-0 flex-1">
                    <ClientOnly fallback={<Skeleton className="h-full w-full rounded-none" />}>
                      <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                        <MindMapView sourceNoteId={session.noteId ?? id ?? null} sourceNoteTitle={title || null} value={mindmap} onChange={onMindmapChange} onShowSource={showSource} onRegenerate={() => runMindmap(markdown)} fileBase={fileBase} />
                      </Suspense>
                    </ClientOnly>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-muted-foreground">Turn this transcript into an interactive mind map.</p>
                    <Button onClick={() => runMindmap(markdown)} disabled={!markdown.trim()}>Generate mind map</Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </div>
        {session.noteId && <LocalGraph noteId={session.noteId} />}
        </div>
        <aside className="sticky top-16 hidden max-h-[calc(100dvh-5rem)] w-[320px] shrink-0 self-start overflow-y-auto rounded-xl border lg:block xl:w-[368px]">{insight}</aside>
        <Sheet open={insightOpen} onOpenChange={setInsightOpen}>
          <SheetContent side="right" className="w-[min(92vw,380px)] overflow-y-auto p-0"><SheetTitle className="sr-only">Insight</SheetTitle>{insight}</SheetContent>
        </Sheet>
      </main>
    </div>
  );
}
