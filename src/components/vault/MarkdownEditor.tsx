import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { transcribeNotes } from "@/lib/ai/tasks";
import { drawStrokes, parseInk, serializeInk, simplify, type Stroke } from "@/lib/ink";
import type { VNote } from "@/lib/vault";

const SLASH = [
  { label: "Heading 1", text: "# " },
  { label: "Heading 2", text: "## " },
  { label: "Heading 3", text: "### " },
  { label: "Bullet list", text: "- " },
  { label: "Numbered list", text: "1. " },
  { label: "Checklist", text: "- [ ] " },
  { label: "Callout", text: "> [!note] " },
  { label: "Quote", text: "> " },
  { label: "Divider", text: "---\n" },
];

type Menu = { type: "slash" | "link"; query: string; start: number } | null;

const TOOL = "grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm text-foreground hover:bg-secondary";

/**
 * Markdown textarea with a "/" block menu and a "[[" note picker. Writing tools stay out of the way:
 * a small text bar appears while you type or select, and a Pencil mode (P, or a stylus) draws ink on the page.
 */
export function MarkdownEditor({ value, onChange, notes, ink, onInkChange }: { value: string; onChange: (v: string) => void; notes: VNote[]; ink?: string | undefined; onInkChange?: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"type" | "pencil">("type");
  const [barOn, setBarOn] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => parseInk(ink));
  const cur = useRef<[number, number][] | null>(null);
  const drawing = useRef(false);
  const [transcribing, setTranscribing] = useState(false);

  // Show the text bar while writing or selecting, then let it fade.
  const poke = useCallback(() => {
    setBarOn(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { const el = ref.current; if (!el || el.selectionStart === el.selectionEnd) setBarOn(false); }, 2500);
  }, []);
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);

  // Ink that arrives from another device, when we're not in the middle of a stroke.
  useEffect(() => { if (!drawing.current) setStrokes(parseInk(ink)); }, [ink]);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    drawStrokes(ctx, cur.current ? [...strokes, { p: cur.current }] : strokes, w, getComputedStyle(c).color);
  }, [strokes]);
  useEffect(() => {
    redraw();
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(redraw); ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  // P switches to Pencil and back; a stylus does it on its own.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(t?.tagName ?? "") && !t?.isContentEditable) setMode((m) => (m === "pencil" ? "type" : "pencil"));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  function commit(next: Stroke[]) {
    setStrokes(next);
    const s = serializeInk(next);
    if (s === null) { toast.error("This page has a lot of ink. Clear some before adding more."); return; }
    onInkChange?.(s);
  }
  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    const k = 1000 / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  const down = (e: React.PointerEvent) => { if (mode !== "pencil") return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; cur.current = [pt(e)]; redraw(); };
  const move = (e: React.PointerEvent) => { if (!drawing.current || !cur.current) return; cur.current.push(pt(e)); redraw(); };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const p = cur.current; cur.current = null;
    if (p && p.length) commit([...strokes, { p: simplify(p) }]);
  };

  async function transcribeInk() {
    if (!strokes.length) { toast("Write something with the pencil first."); return; }
    setTranscribing(true);
    try {
      const w = 1000, maxY = Math.max(...strokes.flatMap((s) => s.p.map((q) => q[1]))) + 40;
      const off = document.createElement("canvas");
      off.width = w; off.height = Math.max(200, Math.ceil(maxY));
      const ctx = off.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, off.width, off.height);
      drawStrokes(ctx, strokes, w, "#111", 3);
      const r = await transcribeNotes({ images: [off.toDataURL("image/jpeg", 0.9)] });
      if (!r.ok) { toast.error(r.error); return; }
      onChange(`${value.trimEnd()}${value.trim() ? "\n\n" : ""}${r.result.markdown}`);
      toast.success("Added your handwriting as text");
    } finally { setTranscribing(false); }
  }

  /** Wrap the selection (or the caret) in markdown markers without losing the selection. */
  function wrap(before: string, after = before) {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = `${value.slice(0, a)}${before}${value.slice(a, b)}${after}${value.slice(b)}`;
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, b + before.length); });
  }
  function link() {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const text = value.slice(a, b) || "link";
    onChange(`${value.slice(0, a)}[${text}](https://)${value.slice(b)}`);
    const urlAt = a + text.length + 3;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(urlAt, urlAt + 8); });
  }
  function margin() {
    const el = ref.current; if (!el) return;
    const nl = value.indexOf("\n", el.selectionEnd);
    const at = nl === -1 ? value.length : nl;
    onChange(`${value.slice(0, at)}\n\n> [!note] ${value.slice(at)}`);
    requestAnimationFrame(() => { el.focus(); const p = at + 12; el.setSelectionRange(p, p); });
  }

  const items = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    if (menu.type === "slash") return SLASH.filter((s) => s.label.toLowerCase().includes(q)).map((s) => ({ label: s.label, insert: s.text }));
    const hits = notes.filter((n) => !n.deleted_at && n.title.toLowerCase().includes(q)).slice(0, 8).map((n) => ({ label: n.title, insert: `[[${n.title}]]` }));
    if (menu.query.trim() && !hits.some((h) => h.label.toLowerCase() === q)) hits.push({ label: `Create "${menu.query.trim()}"`, insert: `[[${menu.query.trim()}]]` });
    return hits;
  }, [menu, notes]);

  function detect(v: string, caret: number) {
    const before = v.slice(0, caret);
    const link = /\[\[([^\[\]\n]*)$/.exec(before);
    if (link) { setMenu({ type: "link", query: link[1] ?? "", start: caret - link[0].length }); setSel(0); return; }
    const line = before.slice(before.lastIndexOf("\n") + 1);
    const slash = /^\/(\w*)$/.exec(line);
    if (slash) { setMenu({ type: "slash", query: slash[1] ?? "", start: caret - line.length }); setSel(0); return; }
    setMenu(null);
  }

  function pick(i: number) {
    const it = items[i];
    const el = ref.current;
    if (!it || !menu || !el) return;
    let end = el.selectionStart;
    if (menu.type === "link" && value.slice(end, end + 2) === "]]") end += 2;
    const next = value.slice(0, menu.start) + it.insert + value.slice(end);
    onChange(next);
    setMenu(null);
    const pos = menu.start + it.insert.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }

  return (
    <div className="relative h-full" onPointerDownCapture={(e) => { if (e.pointerType === "pen") setMode("pencil"); }}>
      <Textarea
        ref={ref}
        value={value}
        placeholder="Start writing… type / for blocks, [[ to link a note"
        onSelect={() => { const el = ref.current; if (el && el.selectionStart !== el.selectionEnd) poke(); }}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); poke(); }}
        onKeyDown={(e) => {
          if (!menu || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % items.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + items.length) % items.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(sel); }
          else if (e.key === "Escape") setMenu(null);
        }}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        className="h-full resize-none rounded-none border-0 bg-transparent px-5 pb-4 pt-11 font-mono text-sm shadow-none focus-visible:ring-0"
        aria-label="Note markdown"
      />
      <canvas ref={canvas} aria-label="Pencil layer" data-ink onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className={`absolute inset-0 h-full w-full text-foreground ${mode === "pencil" ? "cursor-crosshair" : "pointer-events-none"}`} style={{ touchAction: mode === "pencil" ? "none" : "auto" }} />
      <div className="absolute right-3 top-2 flex rounded-md border bg-background/80 text-[11px] backdrop-blur" role="group" aria-label="Writing mode">
        <button type="button" aria-pressed={mode === "type"} onClick={() => setMode("type")} className={`px-2 py-1 ${mode === "type" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>Type</button>
        <button type="button" aria-pressed={mode === "pencil"} onClick={() => setMode("pencil")} className={`px-2 py-1 ${mode === "pencil" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>Pencil <kbd className="ml-0.5 font-mono opacity-60">P</kbd></button>
      </div>
      <div role="toolbar" aria-label={mode === "pencil" ? "Pencil tools" : "Text tools"} aria-hidden={mode === "type" && !barOn}
        className={`absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-popover/95 p-1 shadow-lg backdrop-blur transition-opacity duration-300 ${mode === "pencil" || barOn ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onMouseDown={(e) => e.preventDefault()}>
        {mode === "type" ? <>
          <button type="button" className={`${TOOL} font-bold`} aria-label="Bold" onClick={() => wrap("**")}>B</button>
          <button type="button" className={`${TOOL} italic`} aria-label="Italic" onClick={() => wrap("*")}>I</button>
          <button type="button" className={TOOL} aria-label="Highlight" onClick={() => wrap("==")}><span className="rounded-sm bg-[#c9a24a]/40 px-1">H</span></button>
          <button type="button" className={TOOL} aria-label="Link" onClick={link}>Link</button>
          <button type="button" className={TOOL} aria-label="Margin note" onClick={margin}>Note</button>
        </> : <>
          <button type="button" className={TOOL} disabled={!strokes.length} onClick={() => commit(strokes.slice(0, -1))}>Undo</button>
          <button type="button" className={TOOL} disabled={!strokes.length} onClick={() => commit([])}>Clear ink</button>
          <button type="button" className={TOOL} disabled={transcribing || !strokes.length} onClick={() => void transcribeInk()}>{transcribing ? "Reading…" : "To text"}</button>
          <button type="button" className={`${TOOL} bg-foreground text-background hover:bg-foreground/90`} onClick={() => setMode("type")}>Done</button>
        </>}
      </div>
      {menu && items.length > 0 && (
        <div role="listbox" aria-label={menu.type === "slash" ? "Blocks" : "Link a note"} className="absolute left-4 top-3 z-20 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{menu.type === "slash" ? "Insert block" : "Link to note"}</p>
          {items.map((it, i) => (
            <button key={it.label} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={`block w-full truncate px-3 py-1.5 text-left text-sm ${i === sel ? "bg-accent text-accent-foreground" : ""}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
