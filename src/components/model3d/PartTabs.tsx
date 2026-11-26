import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { askNotes } from "@/lib/ai/tasks";
import { buildContext, rankNotes } from "@/lib/retrieve";
import { openTarget, useVault, type VNote } from "@/lib/vault";
import type { Part } from "@/lib/model3d";

type Tab = "learn" | "ask" | "notes";
type Answer = { text: string; sources: string[] };

/** What a person can do with a selected part: learn about it, ask the vault, keep their own notes. */
export function PartTabs({ part, modelTitle, editable, onNote }: { part: Part; modelTitle: string; editable: boolean; onNote: (v: string) => void }) {
  const { data: vault } = useVault();
  const [tab, setTab] = useState<Tab>("learn");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { setAnswer(null); setQ(""); setTab("learn"); }, [part.id]);

  const live = (vault?.notes ?? []).filter((n) => !n.deleted_at);
  const related = rankNotes(live, `${part.name} ${modelTitle}`, 3);

  async function run(question: string, extra = "") {
    setBusy(true);
    try {
      const pool = rankNotes(live, `${question} ${part.name}`, 4);
      const own = `# ${part.name} (a part of ${modelTitle})\n${part.description}\n${part.note ?? ""}${extra}`;
      const r = await askNotes({ question, context: `${own}\n\n${buildContext(pool, 4000)}` });
      setAnswer(r.ok ? { text: r.answer.answer, sources: r.answer.sources } : { text: r.error, sources: [] });
    } finally { setBusy(false); }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1 text-xs ${tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {label}{t === "notes" && part.note ? <span aria-label="has notes" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#c9a24a]" /> : null}
    </button>
  );

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Part" className="flex gap-1">{tabBtn("learn", "Learn")}{tabBtn("ask", "Ask")}{tabBtn("notes", "Notes")}</div>
      {tab === "learn" && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">{part.description || "No description yet."}</p>
          <button disabled={busy} onClick={() => void run(`Explain the ${part.name} of ${modelTitle} for someone learning it.`)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60">
            {busy ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null} Explain this part
          </button>
          {related.length > 0 && (
            <div><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">In your notes</p>
              <ul className="mt-1 space-y-0.5">{related.map((n: VNote) => <li key={n.id}><Link {...openTarget(n)} className="text-sm underline-offset-2 hover:underline">{n.title || "Untitled"}</Link></li>)}</ul></div>
          )}
        </div>
      )}
      {tab === "ask" && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void run(q.trim()); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about the ${part.name}…`} aria-label="Ask about this part" className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm" />
          <button type="submit" disabled={busy || !q.trim()} className="rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-60">{busy ? "Thinking…" : "Ask your vault"}</button>
        </form>
      )}
      {tab === "notes" && (editable
        ? <label className="block text-sm"><span className="sr-only">Your notes on this part</span><textarea className="w-full rounded-md border bg-background p-2 text-sm" rows={4} placeholder="Your own notes on this part" value={part.note ?? ""} onChange={(e) => onNote(e.target.value)} /></label>
        : <p className="text-sm text-muted-foreground">{part.note || "No notes on this part."}</p>)}
      {answer && tab !== "notes" && (
        <div className="rounded-lg border bg-background/60 p-2.5 text-sm" aria-live="polite">
          <p className="whitespace-pre-wrap">{answer.text}</p>
          {answer.sources.length > 0 && <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">From: {answer.sources.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}
