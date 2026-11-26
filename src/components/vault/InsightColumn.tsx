import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2, Network, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { GenerateDialog } from "@/components/study/GenerateDialog";
import { InferenceBadge } from "@/components/shell/InferenceBadge";
import { askNotes, summariseStream } from "@/lib/ai/tasks";
import { citedSources, passagesOf, type Citation, type Source } from "@/lib/ai/cite";
import { AnswerCard } from "@/components/shell/AnswerCard";
import { SourceList } from "@/components/shell/SourceList";
import { explain } from "@/lib/ai/run";
import { rankNotes } from "@/lib/retrieve";
import { studyOverviewQuery } from "@/lib/study";
import { openTarget, type VNote, type Vault } from "@/lib/vault";

const label = "font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";
const module_ = "rounded-xl border bg-card/60 p-3.5";

const QUICK = ["Explain like I'm new", "What are the key terms?", "What should I remember?"];

/** The note's side of the workspace: summary, study actions, sources and Ask, all visible at once. */
export function InsightColumn({ note, vault, markdown, onOpenGraph, saved = true }: { note: VNote; vault: Vault; markdown: string; onOpenGraph: () => void; saved?: boolean }) {
  const navigate = useNavigate();
  const live = vault.notes.filter((n) => !n.deleted_at);
  const { data: study } = useQuery(studyOverviewQuery);

  const needSave = () => toast("Save this note first, then you can make cards and quizzes from it.");
  const [summary, setSummary] = useState<string | null>(null);
  const [summarySources, setSummarySources] = useState<Source[]>([]);
  const [summarising, setSummarising] = useState(false);
  async function summarise() {
    if (!markdown.trim()) { toast("Write or transcribe something first."); return; }
    setSummarising(true);
    try {
      setSummary("");
      const sources = passagesOf(markdown, note.title, note.id, note.kind);
      setSummarySources(sources);
      const out = await summariseStream({ title: note.title, sources }, (t) => setSummary(t));
      setSummary(out || null);
    } catch (e) { toast.error(explain(e).message); }
    finally { setSummarising(false); }
  }

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"note" | "all">("note");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; text: string; citations: Citation[] } | null>(null);
  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setAsking(true);
    try {
      const pool = scope === "note" ? [{ ...note, markdown }] : rankNotes(live.map((n) => (n.id === note.id ? { ...n, markdown } : n)), text, 5);
      const r = await askNotes({ question: text, sources: pool.map((n) => ({ id: n.id, kind: n.kind, title: n.title, text: n.markdown })) });
      if (!r.ok) { toast.error(r.error); return; }
      setAnswer({ q: text, text: r.answer.answer, citations: r.answer.citations });
      setQ("");
    } finally { setAsking(false); }
  }

  const sources = note.source_note_ids.map((id) => live.find((n) => n.id === id)).filter((n): n is VNote => !!n);
  const backlinks = vault.links.filter((l) => l.to_note_id === note.id).map((l) => live.find((n) => n.id === l.from_note_id)).filter((n): n is VNote => !!n);
  const due = study?.dueTotal ?? 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3.5" data-testid="insight-column">
      <div className="flex items-center justify-between">
        <span className={label}>Insight</span>
        <InferenceBadge />
      </div>

      <section className={module_} aria-label="Summary">
        <div className="mb-2 flex items-center justify-between"><span className={label}>Summary</span>
          <button onClick={summarise} disabled={summarising} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60">
            {summarising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{summary ? "Redo" : "Summarize"}
          </button>
        </div>
        {summarising && !summary
          ? <p className="text-sm text-muted-foreground" aria-live="polite">Reading your note…</p>
          : summary
          ? <>
              <div className="transcript text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown></div>
              {(() => {
                const cited = citedSources(summary, summarySources);
                return cited.length
                  ? <SourceList items={cited.map((c) => ({ n: c.n, title: c.title, id: c.id, kind: c.kind, quote: c.text }))} />
                  : !summarising && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground" data-no-source>This summary didn't point at passages in your note.</p>;
              })()}
            </>
          : <p className="text-sm text-muted-foreground">A short summary of this note, made from what you wrote.</p>}
      </section>

      <section className={module_} aria-label="Study">
        <div className="mb-2"><span className={label}>Make from this note</span></div>
        <div className="grid grid-cols-3 gap-1.5 text-sm">
          {saved ? <>
            <GenerateDialog noteIds={[note.id]} initialKind="flashcards" trigger={<button className="w-full rounded-lg border py-2 hover:bg-secondary">Cards</button>} />
            <GenerateDialog noteIds={[note.id]} initialKind="quiz" trigger={<button className="w-full rounded-lg border py-2 hover:bg-secondary">Quiz</button>} />
          </> : <>
            <button onClick={needSave} className="w-full rounded-lg border py-2 hover:bg-secondary">Cards</button>
            <button onClick={needSave} className="w-full rounded-lg border py-2 hover:bg-secondary">Quiz</button>
          </>}
          <button onClick={onOpenGraph} className="inline-flex items-center justify-center gap-1 rounded-lg border py-2 hover:bg-secondary"><Network className="h-3.5 w-3.5" />Map</button>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border p-2.5">
          <span className="font-serif text-2xl leading-none">{due}</span>
          <span className="flex-1 text-xs leading-tight text-muted-foreground">{due === 1 ? "card" : "cards"} due<br />{due ? `about ${Math.max(1, Math.round(due / 2))} min` : "all caught up"}</span>
          <Link to="/study" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Study</Link>
        </div>
      </section>

      <section className={module_} aria-label="Sources">
        <div className="mb-2"><span className={label}>Sources &amp; links</span></div>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2 text-muted-foreground"><span className="font-mono text-[10px] uppercase">{note.kind}</span><span>this note</span></li>
          {sources.map((n) => <li key={n.id}><button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => navigate(openTarget(n))}><span className="font-mono text-[10px] uppercase text-muted-foreground">src</span><span className="truncate">{n.title}</span></button></li>)}
          {backlinks.map((n) => <li key={n.id}><button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => navigate(openTarget(n))}><span className="font-mono text-[10px] uppercase text-muted-foreground">←</span><span className="truncate">{n.title}</span></button></li>)}
          {!sources.length && !backlinks.length && <li className="text-xs text-muted-foreground">Link notes by typing [[ in the editor.</li>}
        </ul>
      </section>

      <section className={`${module_} mt-auto`} aria-label="Ask">
        <div className="mb-2 flex items-center justify-between"><span className={label}>Ask</span>
          <div className="flex rounded-md border text-[11px]">
            {(["note", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`px-2 py-0.5 ${scope === s ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>{s === "note" ? "This note" : "All notes"}</button>)}
          </div>
        </div>
        {answer && <div className="mb-3"><AnswerCard question={answer.q} text={answer.text} citations={answer.citations} /></div>}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK.map((c) => <button key={c} disabled={asking} onClick={() => void ask(c)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60">{c}</button>)}
        </div>
        <form className="flex items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-1.5" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={scope === "note" ? "Ask this note…" : "Ask all your notes…"} aria-label="Ask a question" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <button type="submit" disabled={asking || !q.trim()} aria-label="Send" className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">{asking ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}</button>
        </form>
      </section>
    </div>
  );
}
