import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SplitPreview, type SplitMaterial } from "@/components/split/SplitPreview";
import { importFromUrl, sectioniseNote } from "@/lib/ai/tasks";
import { findVideos, wikipediaFor, type Video, type WikiArticle } from "@/lib/research";
import { Doodle, Working } from "@/components/fun/Doodle";
import type { Section } from "@/lib/split";
import { useVault } from "@/lib/vault";

const label = "font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

type Status = "idle" | "working" | "done" | "failed";
type Piece = { overview: string; sections: Section[]; source: string };

/**
 * "I need to learn about X": look X up on Wikipedia and YouTube, show what was found as it arrives, and build notes from the
 * sources you keep. The ticked sources start being read as soon as they appear, so by the time you press Build most of the
 * waiting is done. Nothing is saved until you name the topic in the preview.
 */
export function ResearchPanel({ subject, folderId = null, onClose }: { subject: string; folderId?: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: vault } = useVault();
  const folderName = folderId ? vault?.folders.find((f) => f.id === folderId)?.name : undefined;
  // undefined means still looking; null or [] means looked and found nothing.
  const [wiki, setWiki] = useState<WikiArticle | null | undefined>(undefined);
  const [videos, setVideos] = useState<Video[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [building, setBuilding] = useState(false);
  const [material, setMaterial] = useState<SplitMaterial | null>(null);
  const [tick, setTick] = useState(0);
  const ran = useRef<string | null>(null);
  const jobs = useRef(new Map<string, Promise<Piece | null>>());
  const panel = useRef<HTMLElement>(null);
  const set = (k: string, s: Status) => setStatus((x) => ({ ...x, [k]: s }));
  // On a phone the panel opens below the box and the bottom bar; bring it into view.
  useEffect(() => { panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [wiki, videos, error]);

  /** Read one source into notes. Started once and kept, whether it began on its own or when Build was pressed. */
  function read(key: string, w?: WikiArticle, v?: Video): Promise<Piece | null> {
    const have = jobs.current.get(key);
    if (have) return have;
    const job = (async (): Promise<Piece | null> => {
      set(key, "working");
      try {
        if (w) {
          const r = await sectioniseNote({ title: w.title, markdown: w.text });
          if (!r.ok) { set(key, "failed"); return null; }
          set(key, "done");
          const source = `[Wikipedia: ${w.title}](${w.url})`;
          return { overview: r.result.overview, source, sections: r.result.sections.map((x) => ({ ...x, markdown: `${x.markdown}\n\n*Source: ${source}*` })) };
        }
        const r = await importFromUrl({ url: v!.url });
        if (!r.ok) { set(key, "failed"); return null; }
        set(key, "done");
        const source = `[${v!.title}](${v!.url})`;
        return { overview: r.item.overview, source, sections: r.item.sections.map((x) => ({ ...x, title: `${x.title} (video)`, markdown: `${x.markdown}\n\n*Source: ${source}*` })) };
      } catch { set(key, "failed"); return null; }
    })();
    jobs.current.set(key, job);
    return job;
  }

  useEffect(() => {
    if (ran.current === subject) return;
    ran.current = subject;
    jobs.current.clear();
    setWiki(undefined); setVideos(undefined); setError(""); setStatus({}); setMaterial(null); setPicked(new Set());
    const mine = () => ran.current === subject;
    let w: WikiArticle | null | undefined, vs: Video[] | undefined;
    const settle = () => { if (mine() && w !== undefined && vs !== undefined && !w && !vs.length) setError(`I couldn't find a Wikipedia article or videos for “${subject}”. Try different words.`); };
    wikipediaFor(subject).then((r) => {
      w = r; if (!mine()) return;
      setWiki(r);
      if (r) { setPicked((p) => new Set(p).add("wiki")); void read("wiki", r); }
      settle();
    }).catch(() => { w = null; if (mine()) { setWiki(null); settle(); } });
    findVideos(subject).then((r) => {
      vs = r; if (!mine()) return;
      setVideos(r);
      // Wikipedia and the top two videos are ticked and start reading now; the rest are opt-in.
      for (const v of r.slice(0, 2)) { setPicked((p) => new Set(p).add(v.url)); void read(v.url, undefined, v); }
      settle();
    }).catch(() => { vs = []; if (mine()) { setVideos([]); settle(); } });
  }, [subject, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function build() {
    if (!picked.size || building) return;
    setBuilding(true);
    const list: Promise<Piece | null>[] = [];
    if (wiki && picked.has("wiki")) list.push(read("wiki", wiki));
    for (const v of (videos ?? []).filter((x) => picked.has(x.url))) list.push(read(v.url, undefined, v));
    const pieces = (await Promise.all(list)).filter((p): p is Piece => !!p && p.sections.length > 0);
    setBuilding(false);
    if (!pieces.length) { toast.error("I couldn't make notes from those sources. Try another one."); return; }
    if (pieces.length < list.length) toast.warning("One source couldn't be read, so it was left out.");
    setMaterial({
      title: titleCase(subject),
      overview: pieces.map((p) => p.overview).find((o) => o.trim()) ?? "",
      sections: pieces.flatMap((p) => p.sections),
      source: pieces.map((p) => p.source).join(" · "),
      tags: ["research"],
    });
  }

  const row = "flex items-start gap-2.5 rounded-lg border p-2.5 text-sm";
  const mark = (k: string, kind: "book" | "video") => status[k] === "working" ? <span aria-label="Reading" className="text-foreground"><Doodle kind={kind} className="h-6 w-6" /></span>
    : status[k] === "done" ? <Check className="pop h-4 w-4 text-muted-foreground" aria-label="Ready" />
    : status[k] === "failed" ? <span className="text-xs text-destructive">Couldn't read</span> : null;
  const looking = wiki === undefined && videos === undefined;
  const anyWorking = building || [...picked].some((k) => status[k] === "working");
  const retry = () => { ran.current = null; setTick((n) => n + 1); };

  return (
    <section ref={panel} className="enter-pop mt-3 scroll-mb-28 rounded-2xl border bg-card/60 p-3.5" aria-label={`Researching ${subject}`} data-research>
      <div className="mb-2.5 flex items-center justify-between">
        <span className={label}>Learning · {titleCase(subject)}</span>
        <button onClick={onClose} disabled={building} aria-label="Close" className="-m-2 p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"><X className="h-4 w-4" /></button>
      </div>

      {looking && !error && <Working kind="search" quips="research" steps={["Searching Wikipedia…", "Finding videos that explain it…", "Checking every video is real…"]} />}
      {error && <div className="space-y-2"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={retry}>Try again</Button></div>}

      {!looking && !error && (
        <div className="space-y-1.5">
          {wiki && (
            <label className={`${row} enter-pop`}>
              <input type="checkbox" className="mt-1" checked={picked.has("wiki")} disabled={building} onChange={() => toggle("wiki")} />
              <span className="mt-0.5 shrink-0 text-muted-foreground"><Doodle kind="book" className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{wiki.title}</span><span className="block text-xs text-muted-foreground">Wikipedia article</span></span>
              {mark("wiki", "book")}
            </label>
          )}
          {videos === undefined && <div className="px-1 pt-1"><Working kind="video" quips="research" steps={["Finding videos that explain it…", "Checking every video is real…"]} /></div>}
          {(videos ?? []).map((v, i) => (
            <label key={v.url} className={`${row} enter-pop`} style={{ "--i": i } as React.CSSProperties}>
              <input type="checkbox" className="mt-1" checked={picked.has(v.url)} disabled={building} onChange={() => toggle(v.url)} />
              <span className="mt-0.5 shrink-0 text-muted-foreground"><Doodle kind="video" className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{v.title}</span><span className="block truncate text-xs text-muted-foreground">YouTube · {v.channel}</span></span>
              {mark(v.url, "video")}
            </label>
          ))}
          {wiki === null && <p className="px-1 text-xs text-muted-foreground">No Wikipedia article matched “{subject}”.</p>}
          {videos && !videos.length && <p className="px-1 text-xs text-muted-foreground">No videos could be confirmed for “{subject}”.</p>}
          {building && anyWorking && <div className="px-1 pt-2"><Working kind="write" quips="research" steps={["Reading the sources…", "Splitting them into ideas…", "Writing your notes…", "Adding where each part came from…"]} /></div>}
          <div className="sticky bottom-[calc(var(--tabbar,0px)+0.5rem)] z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-card/95 p-1 pt-2 backdrop-blur sm:static sm:mx-0 sm:p-0 sm:pt-1.5 sm:backdrop-blur-none">
            <Button size="sm" className="h-10 sm:h-8" onClick={() => void build()} disabled={building || !picked.size}>
              {building ? "Reading and dividing…" : `Build notes from ${picked.size} source${picked.size === 1 ? "" : "s"}`}
            </Button>
            <p className="text-xs text-muted-foreground">Ticked sources are already being read. You'll name the topic and choose notes before anything is saved.</p>
          </div>
        </div>
      )}

      <SplitPreview open={!!material} onOpenChange={(o) => !o && setMaterial(null)} material={material} initialTopic={material?.title ?? titleCase(subject)} folderId={folderId} {...(folderName ? { folderName } : {})}
        onSaved={(id) => { onClose(); navigate({ to: "/vault/$noteId", params: { noteId: id } }); }} />
    </section>
  );
}
