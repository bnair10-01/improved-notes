import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUp, FileText, Folder, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AddPopover, useBringIn } from "@/components/shell/AddMenu";
import { SplitPreview } from "@/components/split/SplitPreview";
import { importFromUrl, type UrlImport } from "@/lib/ai/tasks";
import { sourceLink } from "@/lib/video";
import { forceMode, homeIntent, toNote, type HomeIntent, type HomeMode } from "@/lib/home-intent";
import { ResearchPanel } from "./ResearchPanel";
import { rankNotes } from "@/lib/retrieve";
import { createNote, openTarget, useRefreshVault, type VFolder, type VNote } from "@/lib/vault";

const HINT: Record<HomeIntent["kind"], string> = {
  empty: "",
  note: "Enter starts a note with this",
  ask: "",
  learn: "Enter looks this up on Wikipedia and YouTube and builds notes",
  youtube: "Enter reads this video and divides it into notes",
  website: "Enter reads this page and divides it into notes",
};

/** Notes and topics whose names or text match what's being typed. Local only: no network, no AI. */
function matches(notes: VNote[], folders: VFolder[], text: string) {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return { notes: [], folders: [] };
  const byTitle = notes.filter((n) => n.title.toLowerCase().includes(q));
  const byText = rankNotes(notes, text, 5).filter((n) => !byTitle.includes(n));
  return { notes: [...byTitle, ...byText].slice(0, 5), folders: folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 3) };
}

const MODE_KEY = "home-mode";
const savedMode = (): HomeMode => { try { return localStorage.getItem(MODE_KEY) === "note" ? "note" : "research"; } catch { return "research"; } };

/**
 * The one box on Home. Type, then Enter either looks it up and builds notes (Research) or starts a note with it (Note),
 * whichever is chosen next to the box. A pasted link is read as a link. "+" or drop a file to bring something in.
 */
export function HomeComposer({ notes, folders, autoFocus }: { notes: VNote[]; folders: VFolder[]; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [imported, setImported] = useState<UrlImport | null>(null);
  const [mode, setMode] = useState<HomeMode>(savedMode);
  const [researching, setResearching] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const intent = forceMode(mode, text, homeIntent(text, false));
  const found = useMemo(() => (intent.kind === "youtube" || intent.kind === "website" ? { notes: [], folders: [] } : matches(notes, folders, text)), [notes, folders, text, intent.kind]);
  const pick = (m: HomeMode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* remembering is optional */ } };
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => { if (autoFocus && window.matchMedia("(pointer: fine)").matches) box.current?.focus(); }, [autoFocus]);
  // Grow with the text, up to a comfortable height.
  useEffect(() => { const el = box.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 260)}px`; }, [text]);

  async function startNote(t = text) {
    const { title, markdown } = toNote(t);
    setBusy("note");
    try {
      const id = await createNote({ kind: "text", title, markdown });
      await refresh();
      navigate({ to: "/vault/$noteId", params: { noteId: id } });
    } catch { toast.error("Couldn't start the note. Please try again."); setBusy(null); }
  }

  async function readLink(url: string) {
    setBusy("link");
    try {
      const r = await importFromUrl({ url });
      if (!r.ok) { toast.error(r.error); return; }
      setImported(r.item);
    } catch { toast.error("Couldn't read that link. Please try again."); }
    finally { setBusy(null); }
  }

  function research(subject: string) { setResearching(subject); setText(""); }

  function submit() {
    if (busy) return;
    if (intent.kind === "note") void startNote();
    else if (intent.kind === "learn") research(intent.subject);
    else if (intent.kind === "youtube" || intent.kind === "website") void readLink(intent.url);
  }

  const bringIn = useBringIn(setBusy);

  return (
    <div className="w-full">
      <div
        data-home-composer
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void bringIn(e.dataTransfer.files); }}
        className={`rounded-2xl border bg-card shadow-sm transition-colors focus-within:border-foreground/40 ${dragging ? "border-foreground/60 bg-secondary/60" : ""}`}
      >
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void bringIn(e.clipboardData.files); } }}
          rows={2}
          disabled={!!busy}
          aria-label="Write a note, look something up, or paste a link"
          placeholder={dragging ? "Drop it here" : mode === "note" ? "Write a note, or paste a link…" : "What do you want to learn? Or paste a link…"}
          className="block w-full resize-none bg-transparent px-4 pb-1 pt-4 text-[16px] leading-relaxed sm:text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-70"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <AddPopover align="start" onBusy={setBusy}>
            <button type="button" aria-label="Add a note, scan, recording, PDF, link or file" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-muted-foreground hover:bg-secondary hover:text-foreground sm:h-8 sm:w-8"><Plus className="h-4 w-4" /></button>
          </AddPopover>
          <div role="group" aria-label="What Enter does" className="flex shrink-0 rounded-full border p-0.5 text-xs" data-home-mode>
            {([["research", "Research", "Look it up on Wikipedia and YouTube and build notes"], ["note", "Note", "Start a note with what you type"]] as const).map(([m, name, tip]) => (
              <button key={m} type="button" title={tip} aria-pressed={mode === m} onClick={() => pick(m)}
                className={`rounded-full px-3 py-2 transition-colors sm:px-2.5 sm:py-1 ${mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{name}</button>
            ))}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" aria-live="polite" data-home-hint>
            {busy === "link" ? "Reading… this runs in the cloud" : text.trim() ? HINT[intent.kind] : touch ? "Tap + to scan, record or import a file" : "Or drop a photo, PDF, slides or a recording here"}
          </p>
          <button type="button" onClick={submit} disabled={!!busy || intent.kind === "empty"} aria-label={HINT[intent.kind] || "Send"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30 sm:h-8 sm:w-8">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {(found.notes.length > 0 || found.folders.length > 0) && (
        <div className="mt-3 rounded-xl border bg-card/60 p-1.5" data-home-matches>
          <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">In your notes</p>
          {found.folders.map((f) => (
            <Link key={f.id} to="/topics/$folderId" params={{ folderId: f.id }} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-secondary">
              <Folder className="h-3.5 w-3.5 text-muted-foreground" /> {f.name}
            </Link>
          ))}
          {found.notes.map((n) => (
            <Link key={n.id} {...openTarget(n)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-secondary">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{n.title || "Untitled"}</span>
            </Link>
          ))}
        </div>
      )}

      {researching && <ResearchPanel subject={researching} onClose={() => setResearching(null)} />}

      <SplitPreview open={!!imported} onOpenChange={(o) => !o && setImported(null)}
        material={imported ? { ...imported, source: sourceLink(imported.kind, imported.title, imported.url), tags: [imported.kind] } : null}
        initialTopic={imported?.title ?? ""} folderId={null}
        onSaved={(id) => navigate({ to: "/vault/$noteId", params: { noteId: id } })} />
    </div>
  );
}
