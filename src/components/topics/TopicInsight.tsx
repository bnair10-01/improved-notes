import { useState } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Download, Loader2, Network, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { InferenceBadge } from "@/components/shell/InferenceBadge";
import { askNotes, summariseStream } from "@/lib/ai/tasks";
import { citedSources, numberSources, type Citation, type Source } from "@/lib/ai/cite";
import { AnswerCard } from "@/components/shell/AnswerCard";
import { SourceList } from "@/components/shell/SourceList";
import { explain } from "@/lib/ai/run";
import { sharedConcepts, topicExport } from "@/lib/topics";
import type { VFolder, VNote } from "@/lib/vault";

const label = "font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";
const box = "rounded-xl border bg-card/60 p-3.5";

/** The topic-wide side column: summary, shared ideas, Ask across everything, and export. */
export function TopicInsight({ folder, notes }: { folder: VFolder; notes: VNote[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summarySources, setSummarySources] = useState<Source[]>([]);
  const [summarising, setSummarising] = useState(false);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; text: string; citations: Citation[] } | null>(null);
  const concepts = sharedConcepts(notes);
  const usable = notes.filter((n) => n.markdown.trim());
  const asSources = () => usable.map((n) => ({ id: n.id, kind: n.kind, title: n.title || "Untitled", text: n.markdown }));

  async function summarise() {
    if (!usable.length) { toast("Add some notes to this topic first."); return; }
    setSummarising(true); setSummary("");
    try {
      const { list } = numberSources(asSources(), 12000);
      setSummarySources(list);
      setSummary((await summariseStream({ title: folder.name, sources: list, style: "key_points", length: "medium" }, setSummary)) || null);
    }
    catch (e) { toast.error(explain(e).message); }
    finally { setSummarising(false); }
  }
  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    if (!usable.length) { toast("Add some notes to this topic first."); return; }
    setAsking(true);
    try {
      const r = await askNotes({ question: text, sources: asSources() });
      if (!r.ok) { toast.error(r.error); return; }
      setAnswer({ q: text, text: r.answer.answer, citations: r.answer.citations }); setQ("");
    } finally { setAsking(false); }
  }
  function exportAll() {
    const blob = new Blob([topicExport(folder, usable)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${folder.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "topic"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-3 p-3.5" data-testid="topic-insight">
      <div className="flex items-center justify-between"><span className={label}>Whole topic</span><InferenceBadge /></div>

      <section className={box} aria-label="Summary">
        <div className="mb-2 flex items-center justify-between"><span className={label}>Summary · {usable.length} item{usable.length === 1 ? "" : "s"}</span>
          <button onClick={summarise} disabled={summarising} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60">
            {summarising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{summary ? "Redo" : "Summarize"}
          </button>
        </div>
        {summarising && !summary ? <p className="text-sm text-muted-foreground">Reading everything…</p>
          : summary ? <>
              <div className="transcript text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown></div>
              {(() => {
                const cited = citedSources(summary, summarySources);
                return cited.length ? <SourceList items={cited.map((c) => ({ n: c.n, title: c.title, id: c.id, kind: c.kind }))} />
                  : !summarising && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground" data-no-source>This summary didn't point at specific items.</p>;
              })()}
            </>
          : <p className="text-sm text-muted-foreground">One summary across every item in this topic.</p>}
      </section>

      <section className={box} aria-label="Shared concepts">
        <div className="mb-2"><span className={label}>Shared concepts</span></div>
        {concepts.length ? (
          <div className="flex flex-wrap gap-1.5">{concepts.map((c) => <button key={c} onClick={() => void ask(`How does "${c}" show up across these items?`)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-secondary">{c}</button>)}</div>
        ) : <p className="text-sm text-muted-foreground">Ideas that appear in more than one item show up here.</p>}
      </section>

      <section className={box} aria-label="Ask">
        <div className="mb-2"><span className={label}>Ask across the topic</span></div>
        {answer && <div className="mb-3"><AnswerCard question={answer.q} text={answer.text} citations={answer.citations} /></div>}
        <form className="flex items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-1.5" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask everything in this topic…" aria-label="Ask a question" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <button type="submit" disabled={asking || !q.trim()} aria-label="Send" className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">{asking ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}</button>
        </form>
      </section>

      <section className={box} aria-label="Export and map">
        <div className="grid grid-cols-2 gap-1.5 text-sm">
          <Link to="/topics/$folderId/map" params={{ folderId: folder.id }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 hover:bg-secondary"><Network className="h-3.5 w-3.5" /> 3D map</Link>
          <button onClick={exportAll} className="inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 hover:bg-secondary"><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Export makes one Markdown file with every item. Add it to a NotebookLM notebook as a source.</p>
      </section>
    </div>
  );
}
