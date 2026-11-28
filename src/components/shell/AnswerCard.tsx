import { InferenceBadge } from "@/components/shell/InferenceBadge";
import { SourceList } from "@/components/shell/SourceList";
import type { Citation } from "@/lib/ai/cite";

/** An AI answer with its question, the sources it quoted, and a clear warning when it can't point at any. */
export function AnswerCard({ question, text, citations }: { question: string; text: string; citations: Citation[] }) {
  return (
    <div className="enter-pop rounded-lg border bg-background/60 p-2.5 text-sm" aria-live="polite" data-answer>
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{question}</p>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">AI</span>
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
      {citations.length > 0
        ? <SourceList items={citations} />
        : <p className="mt-2 border-t pt-2 text-xs text-muted-foreground" data-no-source>No passage in your notes backs this up. Treat it with care.</p>}
      <div className="mt-1.5"><InferenceBadge /></div>
    </div>
  );
}
