import { Link } from "@tanstack/react-router";
import { openTarget } from "@/lib/vault";

export type SourceItem = { n: number; title: string; id?: string | undefined; kind?: string | undefined; quote?: string | undefined };

const label = "font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";

/** The sources behind an AI answer: which note, and the exact words it relied on. */
export function SourceList({ items }: { items: SourceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2.5 border-t pt-2" data-sources>
      <p className={label}>Sources</p>
      <ol className="mt-1.5 space-y-1.5">
        {items.map((s, i) => (
          <li key={`${s.n}-${i}`} className="text-xs leading-snug">
            <span className="font-mono text-muted-foreground">[{s.n}]</span>{" "}
            {s.id ? <Link {...openTarget({ id: s.id, kind: s.kind ?? "text" })} className="font-medium underline-offset-2 hover:underline">{s.title}</Link> : <span className="font-medium">{s.title}</span>}
            {s.quote && <q className="mt-0.5 block text-muted-foreground [quotes:'“''”']">{s.quote.length > 160 ? `${s.quote.slice(0, 160).trimEnd()}…` : s.quote}</q>}
          </li>
        ))}
      </ol>
    </div>
  );
}
