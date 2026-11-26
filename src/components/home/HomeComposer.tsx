import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUp, Camera, FileText, Folder, Loader2, Mic, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AnswerCard } from "@/components/shell/AnswerCard";
import { SplitPreview } from "@/components/split/SplitPreview";
import { askNotes, importFromUrl, type UrlImport } from "@/lib/ai/tasks";
import type { Citation } from "@/lib/ai/cite";
import { openDialog } from "@/lib/dialogs";
import { sourceLink } from "@/lib/video";
import { couldBeSubject, forceMode, homeIntent, questionSubject, toNote, type HomeIntent, type HomeMode } from "@/lib/home-intent";
import { ResearchPanel } from "./ResearchPanel";
import { prepareImage } from "@/lib/image";
import { rankNotes } from "@/lib/retrieve";
import { setSession } from "@/lib/session";
import { validateDeckFile } from "@/lib/slides";
import { createNote, openTarget, syncWikilinks, useRefreshVault, useVault, type VFolder, type VNote } from "@/lib/vault";

const ACCEPT = "image/*,.pdf,.pptx,application/pdf,.mp3,.m4a,.wav,.webm,.ogg,audio/*,.txt,.md,text/plain,text/markdown";

const HINT: Record<HomeIntent["kind"], string> = {
  empty: "",
  note: "Enter starts a note with this",
  ask: "Enter asks your notes. Answers cite them",
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

type Answer = { q: string; text: string; citations: Citation[] };

/**
 * The one box on Home. Type to write, ask, search, or paste a link; "+" or drop a file to bring something in.
 * What Enter will do is always shown under the box, with the other choice one click away.
 */
export function HomeComposer({ notes, folders, autoFocus }: { notes: VNote[]; folders: VFolder[]; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const { data: vault } = useVault();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [imported, setImported] = useState<UrlImport | null>(null);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<HomeMode>("auto");
  const [researching, setResearching] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const withText = useMemo(() => notes.filter((n) => n.markdown.trim()), [notes]);
  const base = homeIntent(text, withText.length > 0);
  // A question none of your notes touch is looked up instead of asked, so it never answers from thin air.
  const noneRelevant = base.kind === "ask" && rankNotes(withText, base.question, 1).length === 0;
  const detected: HomeIntent = noneRelevant && base.kind === "ask" ? { kind: "learn", subject: questionSubject(base.question) } : base;
  const intent = forceMode(mode, text, detected);
  const found = useMemo(() => (intent.kind === "youtube" || intent.kind === "website" ? { notes: [], folders: [] } : matches(notes, folders, text)), [notes, folders, text, intent.kind]);

  // Typing a note's or topic's exact name opens it rather than making a duplicate.
  const exact = mode === "auto" && (intent.kind === "note" || intent.kind === "ask")
    ? (() => { const q = text.trim().toLowerCase(); const n = notes.find((x) => x.title.trim().toLowerCase() === q); const f = folders.find((x) => x.name.trim().toLowerCase() === q); return n ? { label: n.title, go: () => navigate(openTarget(n)) } : f ? { label: f.name, go: () => navigate({ to: "/topics/$folderId", params: { folderId: f.id } }) } : null; })()
    : null;
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

  async function ask(q = text.trim()) {
    if (!q) return;
    if (!withText.length) { toast("Write or bring in a note first, then ask about it."); return; }
    setBusy("ask");
    try {
      const ranked = rankNotes(withText, q, 6);
      const pool = ranked.length ? ranked : [...withText].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
      const r = await askNotes({ question: q, sources: pool.map((n) => ({ id: n.id, kind: n.kind, title: n.title || "Untitled", text: n.markdown })) });
      if (!r.ok) { toast.error(r.error); return; }
      setAnswer({ q, text: r.answer.answer, citations: r.answer.citations });
      setText("");
    } finally { setBusy(null); }
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

  async function keepAnswer(a: Answer) {
    const sources = a.citations.map((c) => `${c.n}. [[${c.title}]]: "${c.quote}"`).join("\n");
    const markdown = `${a.text}${sources ? `\n\n**Sources**\n\n${sources}` : ""}`;
    setBusy("keep");
    try {
      const id = await createNote({ kind: "text", title: a.q.replace(/\?+$/, "").slice(0, 80), markdown });
      if (vault) await syncWikilinks(vault, id, markdown).catch(() => undefined);
      await refresh();
      navigate({ to: "/vault/$noteId", params: { noteId: id } });
    } catch { toast.error("Couldn't save the answer."); setBusy(null); }
  }

  function research(subject: string) { setAnswer(null); setResearching(subject); setText(""); }

  function submit() {
    if (busy) return;
    if (exact) exact.go();
    else if (intent.kind === "note") void startNote();
    else if (intent.kind === "ask") void ask(intent.question);
    else if (intent.kind === "learn") research(intent.subject);
    else if (intent.kind === "youtube" || intent.kind === "website") void readLink(intent.url);
  }

  /** Photos go to Scan; PDFs and slides, audio and text files each open where they belong, already chosen. */
  async function bringIn(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      setBusy("files");
      try {
        const pages = await Promise.all(images.map(async (f) => ({ id: crypto.randomUUID(), dataUrl: await prepareImage(f) })));
        setSession({ pages, result: null, noteId: null });
        navigate({ to: "/capture" });
      } catch { toast.error("Couldn't read that photo."); setBusy(null); }
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
      setBusy("note");
      try {
        const id = await createNote({ kind: "text", title: f.name.replace(/\.(txt|md)$/i, ""), markdown: body });
        await refresh();
        navigate({ to: "/vault/$noteId", params: { noteId: id } });
      } catch { toast.error("Couldn't import that file."); setBusy(null); }
    } else toast.error("That file type isn't supported. Try a photo, a PDF or slides, audio, or a text file.");
  }

  const alt = mode !== "auto" ? null : exact ? { label: "Start a new note instead", run: () => void startNote() }
    : intent.kind === "learn" ? { label: "Just write a note", run: () => void startNote() }
    : intent.kind === "note" && couldBeSubject(text) ? { label: "Look it up instead", run: () => research(text.trim()) }
    : intent.kind === "note" && withText.length ? { label: "Ask your notes instead", run: () => void ask() }
    : intent.kind === "ask" ? { label: "Start a note instead", run: () => void startNote() } : null;
  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-secondary";
  const pick = (fn: () => void) => () => { setMenu(false); fn(); };

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
          aria-label="Write, ask your notes, search, or paste a link"
          placeholder={dragging ? "Drop it here" : "Write something, ask your notes, or paste a link…"}
          className="block w-full resize-none bg-transparent px-4 pb-1 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-70"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <Popover open={menu} onOpenChange={setMenu}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Add a scan, recording, PDF or file" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-muted-foreground hover:bg-secondary hover:text-foreground"><Plus className="h-4 w-4" /></button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-1.5">
              <button className={item} onClick={pick(() => navigate({ to: "/capture" }))}><Camera className="h-4 w-4" /> Scan handwriting</button>
              <button className={item} onClick={pick(() => openDialog("audio"))}><Mic className="h-4 w-4" /> Voice or lecture</button>
              <button className={item} onClick={pick(() => openDialog("slides"))}><FileText className="h-4 w-4" /> PDF or slides</button>
              <button className={item} onClick={pick(() => picker.current?.click())}><Paperclip className="h-4 w-4" /> Upload a file…</button>
            </PopoverContent>
          </Popover>
          <div role="group" aria-label="What Enter does" className="flex shrink-0 rounded-full border p-0.5 text-xs" data-home-mode>
            {([["auto", "Auto", "Decide from what you type"], ["research", "Research", "Always look it up on Wikipedia and YouTube"], ["note", "Note", "Always start a note with what you type"]] as const).map(([m, name, tip]) => (
              <button key={m} type="button" title={tip} aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`rounded-full px-2.5 py-1 transition-colors ${mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{name}</button>
            ))}
          </div>
          <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void bringIn(e.target.files); e.target.value = ""; }} />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" aria-live="polite" data-home-hint>
            {busy === "link" ? "Reading… this runs in the cloud" : busy === "ask" ? "Looking through your notes…" : exact ? `Enter opens “${exact.label}”` : text.trim() ? HINT[intent.kind] : touch ? "Tap + to scan, record or import a file" : "Or drop a photo, PDF, slides or a recording here"}
          </p>
          {alt && !busy && <button type="button" onClick={alt.run} className="hidden shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:block">{alt.label}</button>}
          <button type="button" onClick={submit} disabled={!!busy || intent.kind === "empty"} aria-label={exact ? `Open ${exact.label}` : HINT[intent.kind] || "Send"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {alt && !busy && <button type="button" onClick={alt.run} className="mt-2 px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:hidden">{alt.label}</button>}

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

      {answer && (
        <div className="mt-3">
          <AnswerCard question={answer.q} text={answer.text} citations={answer.citations} />
          <div className="mt-1.5 flex gap-3 px-1 text-xs">
            <button onClick={() => void keepAnswer(answer)} disabled={!!busy} className="text-muted-foreground hover:text-foreground">Keep as a note</button>
            <button onClick={() => setAnswer(null)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /> Dismiss</button>
          </div>
        </div>
      )}

      <SplitPreview open={!!imported} onOpenChange={(o) => !o && setImported(null)}
        material={imported ? { ...imported, source: sourceLink(imported.kind, imported.title, imported.url), tags: [imported.kind] } : null}
        initialTopic={imported?.title ?? ""} folderId={null}
        onSaved={(id) => navigate({ to: "/vault/$noteId", params: { noteId: id } })} />
    </div>
  );
}
