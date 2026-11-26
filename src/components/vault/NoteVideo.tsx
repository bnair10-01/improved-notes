import { useEffect, useRef, useState } from "react";
import { ExternalLink, NotebookPen } from "lucide-react";
import { timeLabel, type NoteVideo as Video } from "@/lib/video";

/** Anything on the page can ask the player to jump: a timestamp link in the note, for example. */
const SEEK = "note-video-seek";
export const seekVideo = (id: string, seconds: number) => window.dispatchEvent(new CustomEvent(SEEK, { detail: { id, seconds } }));

type YTPlayer = { getCurrentTime(): number; seekTo(s: number, allowSeekAhead: boolean): void; playVideo(): void; destroy(): void };
type YTApi = { Player: new (el: HTMLElement, opts: { videoId: string; host: string; playerVars: Record<string, number>; events: { onReady: () => void } }) => YTPlayer };
declare global { interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<YTApi> | null = null;
/** YouTube's player script, loaded once and only when a note with a video is opened. */
function loadApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTApi>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT!); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("timeout")), 8000);
  }).catch((e) => { apiPromise = null; throw e; });
  return apiPromise;
}

/**
 * The video a note was built from, kept right on the note so you can watch it, and take your own notes
 * stamped with the moment you're at. If YouTube's player script is blocked it falls back to a plain embed.
 */
export function NoteVideo({ videos, onAddNote }: { videos: Video[]; onAddNote: (id: string, seconds: number) => void }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const [start, setStart] = useState(0);
  const [ready, setReady] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const pending = useRef<number | null>(null);
  const video = videos[Math.min(active, videos.length - 1)]!;

  useEffect(() => {
    if (failed || !holder.current) return;
    let dead = false;
    setReady(false);
    const target = document.createElement("div");
    holder.current.replaceChildren(target);
    void loadApi().then((YT) => {
      if (dead) return;
      player.current = new YT.Player(target, {
        videoId: video.id, host: "https://www.youtube-nocookie.com", playerVars: { rel: 0, playsinline: 1 },
        events: { onReady: () => {
          if (dead) return;
          setReady(true);
          if (pending.current !== null) { player.current?.seekTo(pending.current, true); player.current?.playVideo(); pending.current = null; }
        } },
      });
    }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; try { player.current?.destroy(); } catch { /* already gone */ } player.current = null; };
  }, [video.id, failed]);

  useEffect(() => {
    const on = (e: Event) => {
      const { id, seconds } = (e as CustomEvent<{ id: string; seconds: number }>).detail;
      const i = videos.findIndex((v) => v.id === id);
      if (i < 0) return;
      holder.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (failed) { setActive(i); setStart(seconds); return; }
      if (i !== active) { pending.current = seconds; setActive(i); }
      else if (player.current && ready) { player.current.seekTo(seconds, true); player.current.playVideo(); }
      else pending.current = seconds;
    };
    window.addEventListener(SEEK, on);
    return () => window.removeEventListener(SEEK, on);
  }, [videos, active, ready, failed]);

  const stamp = () => { const t = player.current?.getCurrentTime(); if (typeof t === "number") onAddNote(video.id, t); };

  return (
    <section className="mt-4 rounded-xl border bg-card/50 p-3" aria-label="Video" data-note-video>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Watch</span>
        {videos.length > 1
          ? videos.map((v, i) => (
              <button key={v.id} onClick={() => { setActive(i); setStart(0); }} aria-pressed={i === active} title={v.title}
                className={`max-w-48 truncate rounded-full border px-2.5 py-0.5 text-xs ${i === active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{v.title}</button>
            ))
          : <span className="min-w-0 flex-1 truncate text-sm">{video.title}</span>}
        <a href={video.url} target="_blank" rel="noreferrer" aria-label="Open on YouTube" className="ml-auto text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <div className="aspect-video w-full max-w-[640px] overflow-hidden rounded-lg bg-black">
        {failed
          ? <iframe key={`${video.id}-${start}`} className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0${start ? `&start=${Math.floor(start)}&autoplay=1` : ""}`} title={video.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          : <div ref={holder} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!failed && (
          <button onClick={stamp} disabled={!ready} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50 sm:min-h-0 sm:w-auto sm:justify-start sm:px-2.5 sm:py-1.5 sm:text-xs">
            <NotebookPen className="h-3.5 w-3.5" /> Add my note at this moment
          </button>
        )}
        <p className="text-xs text-muted-foreground">{failed ? "Playing in a basic player. Timestamps in your notes still work." : ready ? `Stamps your note with the time, like ${timeLabel(225)}, and links back to it.` : "Loading the player…"}</p>
      </div>
    </section>
  );
}
