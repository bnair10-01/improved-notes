import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Check, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SplitPreview, type SplitMaterial } from "@/components/split/SplitPreview";
import { importFromUrl, sectioniseNote } from "@/lib/ai/tasks";
import { researchSubject, type Research } from "@/lib/research";
import type { Section } from "@/lib/split";

const label = "font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

type Status = "idle" | "working" | "done" | "failed";
type Piece = { overview: string; sections: Section[]; source: string };

/**
 * "I need to learn about X": look X up on Wikipedia and YouTube, show what was found, and build notes from the
 * sources you keep. Nothing is saved until you name the topic in the preview.
 */
export function ResearchPanel({ subject, onClose }: { subject: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [found, setFound] = useState<Research | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [building, setBuilding] = useState(false);
  const [material, setMaterial] = useState<SplitMaterial | null>(null);
  const ran = useRef<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  // On a phone the panel opens below the box and the bottom bar; bring it into view.
  useEffect(() => { panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [found, error]);

  useEffect(() => {
    if (ran.current === subject) return;
    ran.current = subject;
    setFound(null); setError(""); setStatus({}); setMaterial(null);
    void researchSubject(subject).then((r) => {
      if (ran.current !== subject) return;
      if (!r.ok) { setError(r.error); return; }
      setFound(r.research);
      // Wikipedia and the top two videos are ticked; every video costs a minute of reading, so the rest are opt-in.
      setPicked(new Set([...(r.research.wiki ? ["wiki"] : []), ...r.research.videos.slice(0, 2).map((v) => v.url)]));
    });
  }, [subject]);

  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const set = (k: string, s: Status) => setStatus((x) => ({ ...x, [k]: s }));

  async function build() {
    if (!found || !picked.size || building) return;
    setBuilding(true);
    const jobs: Promise<Piece | null>[] = [];
    if (found.wiki && picked.has("wiki")) {
      const w = found.wiki;
      jobs.push((async () => {
        set("wiki", "working");
        const r = await sectioniseNote({ title: w.title, markdown: w.text });
        if (!r.ok) { set("wiki", "failed"); return null; }
        set("wiki", "done");
        const source = `[Wikipedia: ${w.title}](${w.url})`;
        return { overview: r.result.overview, source, sections: r.result.sections.map((s) => ({ ...s, markdown: `${s.markdown}\n\n*Source: ${source}*` })) };
      })());
    }
    for (const v of found.videos.filter((x) => picked.has(x.url))) {
      jobs.push((async () => {
        set(v.url, "working");
        const r = await importFromUrl({ url: v.url });
        if (!r.ok) { set(v.url, "failed"); return null; }
        set(v.url, "done");
        const source = `[${v.title}](${v.url})`;
        return { overview: r.item.overview, source, sections: r.item.sections.map((s) => ({ ...s, title: `${s.title} (video)`, markdown: `${s.markdown}\n\n*Source: ${source}*` })) };
      })());
    }
    const pieces = (await Promise.all(jobs)).filter((p): p is Piece => !!p && p.sections.length > 0);
    setBuilding(false);
    if (!pieces.length) { toast.error("I couldn't make notes from those sources. Try another one."); return; }
    if (pieces.length < jobs.length) toast.warning("One source couldn't be read, so it was left out.");
    setMaterial({
      title: titleCase(found.subject),
      overview: pieces.map((p) => p.overview).find((o) => o.trim()) ?? "",
      sections: pieces.flatMap((p) => p.sections),
      source: pieces.map((p) => p.source).join(" · "),
      tags: ["research"],
    });
  }

  const row = "flex items-start gap-2.5 rounded-lg border p-2.5 text-sm";
  const mark = (k: string) => status[k] === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Reading" />
    : status[k] === "done" ? <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Done" />
    : status[k] === "failed" ? <span className="text-xs text-destructive">Couldn't read</span> : null;

  return (
    <section ref={panel} className="mt-3 scroll-mb-28 rounded-2xl border bg-card/60 p-3.5" aria-label={`Researching ${subject}`} data-research>
      <div className="mb-2.5 flex items-center justify-between">
        <span className={label}>Learning · {titleCase(subject)}</span>
        <button onClick={onClose} disabled={building} aria-label="Close" className="-m-2 p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"><X className="h-4 w-4" /></button>
      </div>

      {!found && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Looking up Wikipedia and finding videos…</p>}
      {error && <div className="space-y-2"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={() => { ran.current = null; setError(""); setFound(null); void researchSubject(subject).then((r) => { if (r.ok) { ran.current = subject; setFound(r.research); setPicked(new Set([...(r.research.wiki ? ["wiki"] : []), ...r.research.videos.slice(0, 2).map((v) => v.url)])); } else setError(r.error); }); }}>Try again</Button></div>}

      {found && (
        <div className="space-y-1.5">
          {found.wiki && (
            <label className={row}>
              <input type="checkbox" className="mt-1" checked={picked.has("wiki")} disabled={building} onChange={() => toggle("wiki")} />
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block font-medium">{found.wiki.title}</span><span className="block text-xs text-muted-foreground">Wikipedia article</span></span>
              {mark("wiki")}
            </label>
          )}
          {found.videos.map((v) => (
            <label key={v.url} className={row}>
              <input type="checkbox" className="mt-1" checked={picked.has(v.url)} disabled={building} onChange={() => toggle(v.url)} />
              <Play className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{v.title}</span><span className="block truncate text-xs text-muted-foreground">YouTube · {v.channel}</span></span>
              {mark(v.url)}
            </label>
          ))}
          {!found.wiki && <p className="px-1 text-xs text-muted-foreground">No Wikipedia article matched “{found.subject}”.</p>}
          {!found.videos.length && <p className="px-1 text-xs text-muted-foreground">No videos could be confirmed for “{found.subject}”.</p>}
          <div className="sticky bottom-[calc(var(--tabbar,0px)+0.5rem)] z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-card/95 p-1 pt-2 backdrop-blur sm:static sm:mx-0 sm:p-0 sm:pt-1.5 sm:backdrop-blur-none">
            <Button size="sm" className="h-10 sm:h-8" onClick={() => void build()} disabled={building || !picked.size}>
              {building ? <><Loader2 className="animate-spin" /> Reading and dividing…</> : `Build notes from ${picked.size} source${picked.size === 1 ? "" : "s"}`}
            </Button>
            <p className="text-xs text-muted-foreground">You'll name the topic and choose notes before anything is saved. Reading runs in the cloud.</p>
          </div>
        </div>
      )}

      <SplitPreview open={!!material} onOpenChange={(o) => !o && setMaterial(null)} material={material} initialTopic={material?.title ?? titleCase(subject)} folderId={null}
        onSaved={(id) => { onClose(); navigate({ to: "/vault/$noteId", params: { noteId: id } }); }} />
    </section>
  );
}
