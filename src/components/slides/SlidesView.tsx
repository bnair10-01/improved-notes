import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getDoc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { userCol, userDoc, requireUid } from "@/lib/db";
import { signedUrls } from "@/lib/notes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { deckMindmapMode, markdownToSlides, MAX_SLIDES, slidesToMarkdown, type Slide } from "@/lib/slides";
import { transcribeSlideImages } from "@/lib/ai/tasks";

export default function SlidesView({ noteId, markdown, onMarkdownChange }: { noteId: string; markdown: string; onMarkdownChange: (md: string) => void }) {
  const raw = useMemo(() => markdownToSlides(markdown), [markdown]);
  const [index, setIndex] = useState(0), [present, setPresent] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const root = useRef<HTMLDivElement>(null), start = useRef<number | null>(null);
  const transcribe = transcribeSlideImages;
  const { data: attachments = [], isError, isPending } = useQuery({ queryKey: ["slide-images", noteId], queryFn: async () => {
    const snap = await getDocs(query(userCol("attachments"), where("note_id", "==", noteId)));
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as { storage_path: string; position: number; type: string; metadata: Record<string, unknown> | null }) }))
      .filter((a) => a.type === "slide_image").sort((a, b) => a.position - b.position);
    const urls = await signedUrls(rows.map((r) => r.storage_path));
    if (urls.some((u) => !u)) throw new Error("Couldn't load slide images.");
    return rows.map((a, i) => ({ ...a, url: urls[i]! }));
  }, staleTime: 30 * 60 * 1000, refetchInterval: 30 * 60 * 1000 });
  const { data: deck, refetch: refreshDeck } = useQuery({ queryKey: ["deck-mode", noteId], queryFn: async () => {
    const snap = await getDoc(userDoc("notes", noteId)); if (!snap.exists()) throw new Error("Deck not found."); return { structure: (snap.get("structure") ?? null) as unknown };
  } });
  // Path comments keep images bound to slides across reorder/delete. Legacy decks fall back to positions.
  const hasPaths = raw.some((s) => s.imagePath);
  const slides = raw.map((s, i) => !hasPaths && attachments.find((a) => a.position === i) ? { ...s, imagePath: attachments.find((a) => a.position === i)!.storage_path } : s);
  const active = Math.min(index, Math.max(0, slides.length - 1)), slide = slides[active];
  const image = (s: Slide) => attachments.find((a) => a.storage_path === s.imagePath);
  const latest = useRef(slides); latest.current = slides;
  function save(next: Slide[]) { onMarkdownChange(slidesToMarkdown(next)); }
  function update(patch: Partial<Slide>) { save(slides.map((s, i) => i === active ? { ...s, ...patch } : s)); }
  function step(n: number) { setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + n))); }
  function key(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); }
  }
  async function closePresent() { setPresent(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); }
  useEffect(() => { const changed = () => { if (!document.fullscreenElement) setPresent(false); }; document.addEventListener("fullscreenchange", changed); return () => { document.removeEventListener("fullscreenchange", changed); }; }, []);
  const swipe = { onTouchStart: (e: React.TouchEvent) => { start.current = e.touches[0]?.clientX ?? null; }, onTouchEnd: (e: React.TouchEvent) => { const end = e.changedTouches[0]?.clientX; if (start.current !== null && end !== undefined && Math.abs(end - start.current) > 60) step(end < start.current ? 1 : -1); start.current = null; } };
  function visual(s: Slide) { const a = image(s); return <div className="paper-sheet flex aspect-video w-full min-w-0 flex-col justify-center overflow-hidden rounded-lg border p-4 sm:p-8">{a ? <img src={a.url} alt={s.title || "Slide image"} className="h-full w-full object-contain" /> : <><h2 className="break-words text-xl font-semibold sm:text-3xl">{s.title}</h2><ul className="mt-4 list-disc space-y-2 overflow-auto pl-5 text-sm sm:text-lg">{s.bullets.map((b, i) => <li key={i} className="break-words">{b}</li>)}</ul></>}</div>; }
  async function exportPptx() {
    setBusy(true); setStatus("Preparing PowerPoint…");
    try {
      const { default: PptxGenJS } = await import("pptxgenjs"); const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE";
      for (const s of slides) {
        const page = pptx.addSlide(), a = image(s);
        if (a) { const response = await fetch(a.url); if (!response.ok) throw new Error(); const blob = await response.blob(); const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); page.addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5 }); }
        else { page.addText(s.title, { x: 0.6, y: 0.4, w: 12, h: 1, fontSize: 30, bold: true }); page.addText(s.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })), { x: 0.8, y: 1.6, w: 11.8, h: 5.2, fontSize: 22, fit: "shrink" }); }
        if (s.notes) page.addNotes(s.notes);
      }
      await pptx.writeFile({ fileName: "slides.pptx" });
    } catch { toast.error("Couldn't export PowerPoint. Try again after images have loaded."); } finally { setBusy(false); setStatus(""); }
  }
  async function printDeck() {
    const win = window.open("", "_blank"); if (!win) { toast.error("Allow pop-ups to export this deck as PDF."); return; }
    win.opener = null; win.document.title = "Slides — Save as PDF";
    const style = win.document.createElement("style"); style.textContent = "@page{size:landscape;margin:0}body{margin:0;font-family:system-ui}section{box-sizing:border-box;width:100vw;height:100vh;padding:5vw;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{width:100%;height:100%;object-fit:contain}h1{font-size:32pt}li{font-size:22pt;margin-block:1em}"; win.document.head.append(style);
    for (const s of slides) { const section = win.document.createElement("section"), a = image(s); if (a) { const img = win.document.createElement("img"); img.src = a.url; img.alt = s.title; section.append(img); } else { const title = win.document.createElement("h1"); title.textContent = s.title; section.append(title); const ul = win.document.createElement("ul"); for (const b of s.bullets) { const li = win.document.createElement("li"); li.textContent = b; ul.append(li); } section.append(ul); } win.document.body.append(section); }
    try { await Promise.all(Array.from(win.document.images, (img) => img.decode())); win.focus(); win.print(); } catch { toast.error("Couldn't load all images for printing. Please try again."); win.close(); }
  }
  async function transcribeAll() {
    const candidates = slides.filter((s) => { const a = image(s), m = a?.metadata; return a && !s.bullets.length && (m && typeof m === "object" && !Array.isArray(m) && m["image_only"] === true || /^Slide \d+$/.test(s.title)); });
    if (!candidates.length) { toast.info("No image-only slides need transcription."); return; }
    setBusy(true);
    try {
      for (const [i, s] of candidates.entries()) {
        const a = image(s)!; setStatus(`Transcribing ${i + 1} of ${candidates.length}…`);
        const result = await transcribe({ noteId, positions: [a.position] }); if (!result.ok) throw new Error(result.error);
        const lines = (result.slides[0]?.text ?? "").split("\n").map((l) => l.replace(/^#{1,6}\s*|^[-*]\s+/g, "").trim()).filter(Boolean);
        const next = latest.current.map((current) => current.imagePath === s.imagePath ? { ...current, title: lines[0] ?? current.title, bullets: lines.slice(1) } : current);
        latest.current = next; save(next);
      }
      toast.success("Transcription added. Review uncertain words before using it.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't transcribe slides."); } finally { setBusy(false); setStatus(""); }
  }
  async function changeMode(value: "deck" | "slides") {
    if (!deck || busy) return;
    const structure = deck.structure;
    if (structure !== null && !(typeof structure === "object" && !Array.isArray(structure) && "deck_mode" in structure && Object.keys(structure).length === 1)) { toast.info("This deck already has a mind map. Its structure has been preserved."); return; }
    setBusy(true);
    // Compare-and-set avoids overwriting a mind map created on another device.
    try {
      const ref = userDoc("notes", noteId, requireUid());
      await runTransaction(db, async (tx) => {
        const current = (await tx.get(ref)).get("structure") ?? null;
        if (JSON.stringify(current) !== JSON.stringify(structure)) throw new Error("changed");
        tx.update(ref, { structure: { deck_mode: value } });
      });
    } catch { toast.error("Couldn't change the mind map choice. Reload and try again."); }
    await refreshDeck(); setBusy(false);
  }
  return <div ref={root} className="min-w-0 space-y-4" onKeyDown={key}>
    <div className="flex flex-wrap gap-2"><Button disabled={!slide || busy || isPending || isError} variant="outline" onClick={exportPptx}>Export PPTX</Button><Button disabled={!slide || isPending || isError} variant="outline" onClick={printDeck}>Export PDF</Button><Button disabled={!slide} onClick={async () => { setPresent(true); }}>Present</Button><Button variant="outline" disabled={busy || isPending || isError} onClick={transcribeAll}>Transcribe image-only slides</Button></div>
    <p className="text-xs text-muted-foreground">Transcription is optional and uses AI credits. Text edits update the deck; imported images remain unchanged.</p>
    {status && <p role="status" className="text-sm">{status}</p>}{isError && <p role="alert" className="text-sm text-destructive">Couldn't load slide images. Reload to try again.</p>}
    <label className="flex flex-wrap items-center gap-2 text-sm">Mind map<select aria-label="Mind map nodes" className="rounded border bg-background p-2" value={deckMindmapMode(deck?.structure)} disabled={!deck || busy} onChange={(e) => changeMode(e.target.value === "slides" ? "slides" : "deck")}><option value="deck">One node</option><option value="slides">One node per slide</option></select></label>
    <nav aria-label="Slides" className="flex gap-2 overflow-x-auto pb-2">{slides.map((s, i) => <button type="button" key={i} disabled={busy} aria-current={i === active ? "step" : undefined} aria-label={`Slide ${i + 1}: ${s.title}`} onClick={() => setIndex(i)} className={`w-28 shrink-0 rounded border p-2 text-left text-xs ${i === active ? "border-primary bg-secondary" : "border-border"}`}>{image(s) && <img src={image(s)!.url} alt="" className="mb-1 aspect-video w-full object-contain" />}<span className="line-clamp-2">{i + 1}. {s.title || "Untitled"}</span></button>)}</nav>
    {slide ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"><div tabIndex={0} aria-label="Slide preview. Use arrow keys to navigate." {...swipe}>{visual(slide)}<div className="mt-2 flex items-center justify-between"><Button variant="ghost" disabled={active === 0} onClick={() => step(-1)}>Previous</Button><span className="text-sm text-muted-foreground">{active + 1} / {slides.length}</span><Button variant="ghost" disabled={active === slides.length - 1} onClick={() => step(1)}>Next</Button></div></div>
    <fieldset disabled={busy || isPending} className="min-w-0 space-y-3"><label className="grid gap-1 text-sm">Title<input className="w-full rounded border bg-background p-2" value={slide.title} onChange={(e) => update({ title: e.target.value })} /></label><label className="grid gap-1 text-sm">Bullets (one per line)<textarea rows={6} className="w-full rounded border bg-background p-2" value={slide.bullets.join("\n")} onChange={(e) => update({ bullets: e.target.value.split("\n") })} /></label><label className="grid gap-1 text-sm">Speaker notes<textarea rows={4} className="w-full rounded border bg-background p-2" value={slide.notes} onChange={(e) => update({ notes: e.target.value })} /></label><div className="flex flex-wrap gap-2">{[-1, 1].map((delta) => <Button key={delta} variant="outline" disabled={active + delta < 0 || active + delta >= slides.length} onClick={() => { const next = [...slides], other = active + delta; [next[active], next[other]] = [next[other]!, next[active]!]; save(next); setIndex(other); }}>{delta < 0 ? "Move earlier" : "Move later"}</Button>)}<Button variant="outline" onClick={() => { save(slides.filter((_, i) => i !== active)); setIndex(Math.max(0, active - 1)); }}>Delete slide</Button></div></fieldset></div> : <p className="text-muted-foreground">This deck is empty. Add a slide to begin.</p>}
    <Button variant="outline" disabled={busy || isPending || slides.length >= MAX_SLIDES} onClick={() => { save([...slides, { title: "New slide", bullets: [], notes: "" }]); setIndex(slides.length); }}>Add slide</Button>
    <Dialog open={present} onOpenChange={(v) => { if (!v) void closePresent(); }}><DialogContent className="flex h-dvh w-screen max-w-none flex-col rounded-none bg-background p-3 sm:max-w-none" onKeyDown={key} {...swipe}><DialogTitle className="sr-only">Presentation</DialogTitle><div className="flex min-h-0 flex-1 items-center">{slide && visual(slide)}</div><div className="flex flex-wrap items-center justify-center gap-2"><Button variant="outline" onClick={() => step(-1)} disabled={active === 0}>Previous</Button><span>{active + 1} / {slides.length}</span><Button variant="outline" onClick={() => step(1)} disabled={active === slides.length - 1}>Next</Button><Button variant="outline" onClick={(e) => { const dialog = e.currentTarget.closest('[role="dialog"]'); if (dialog instanceof HTMLElement) void dialog.requestFullscreen?.().catch(() => toast.info("Fullscreen isn't supported here. Presentation mode is still available.")); }}>Fullscreen</Button><Button onClick={() => void closePresent()}>Exit</Button></div></DialogContent></Dialog>
  </div>;
}
