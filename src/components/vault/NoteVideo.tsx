import { useEffect, useRef, useState } from "react";
import { ExternalLink, NotebookPen } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { timeLabel, type NoteVideo as Video } from "@/lib/video";

/**
 * YouTube won't play inside an app whose address isn't a real web page (error 153), and the phone apps run from
 * capacitor://localhost. So there the player is a small page on the real site (public/player.html) that the app embeds and messages.
 */
const NATIVE = Capacitor.isNativePlatform();
const PLAYER_ORIGIN = `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "improvednotes-d0907"}.web.app`;
const playerUrl = (id: string, start: number) => `${PLAYER_ORIGIN}/player.html?v=${id}${start > 0 ? `&t=${Math.floor(start)}` : ""}`;

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
  const frame = useRef<HTMLIFrameElement>(null);
  const timeWaiters = useRef(new Map<string, (s: number) => void>());
  const player = useRef<YTPlayer | null>(null);
  const pending = useRef<number | null>(null);
  const video = videos[Math.min(active, videos.length - 1)]!;

  useEffect(() => {
    if (NATIVE || failed || !holder.current) return;
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

  // Phone apps: the hosted player page tells us when it is ready and answers "what time is it?".
  useEffect(() => {
    if (!NATIVE) return;
    const on = (e: MessageEvent) => {
      if (e.origin !== PLAYER_ORIGIN) return;
      const d = e.data as { type?: string; id?: string; seconds?: number };
      if (d.type === "ready") setReady(true);
      if (d.type === "time" && d.id) { timeWaiters.current.get(d.id)?.(d.seconds ?? 0); timeWaiters.current.delete(d.id); }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      const { id, seconds } = (e as CustomEvent<{ id: string; seconds: number }>).detail;
      const i = videos.findIndex((v) => v.id === id);
      if (i < 0) return;
      holder.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (NATIVE) {
        if (i !== active) { setActive(i); setStart(seconds); setReady(false); }
        else frame.current?.contentWindow?.postMessage({ type: "seek", seconds }, PLAYER_ORIGIN);
        return;
      }
      if (failed) { setActive(i); setStart(seconds); return; }
      if (i !== active) { pending.current = seconds; setActive(i); }
      else if (player.current && ready) { player.current.seekTo(seconds, true); player.current.playVideo(); }
      else pending.current = seconds;
    };
    window.addEventListener(SEEK, on);
    return () => window.removeEventListener(SEEK, on);
  }, [videos, active, ready, failed]);

  const stamp = () => {
    if (NATIVE) {
      const id = `${video.id}-${Date.now()}`;
      const w = frame.current?.contentWindow;
      if (!w) return;
      const timer = setTimeout(() => timeWaiters.current.delete(id), 3000);
      timeWaiters.current.set(id, (t) => { clearTimeout(timer); onAddNote(video.id, t); });
      w.postMessage({ type: "time", id }, PLAYER_ORIGIN);
      return;
    }
    const t = player.current?.getCurrentTime();
    if (typeof t === "number") onAddNote(video.id, t);
  };

  return (
    <section className="enter-pop mt-4 rounded-xl border bg-card/50 p-3" aria-label="Video" data-note-video>
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
        {NATIVE
          ? <iframe key={`${video.id}-${start}`} ref={frame} className="h-full w-full" src={playerUrl(video.id, start)} title={video.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          : failed
          ? <iframe key={`${video.id}-${start}`} className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0${start ? `&start=${Math.floor(start)}&autoplay=1` : ""}`} title={video.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          : <div ref={holder} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {(NATIVE || !failed) && (
          <button onClick={stamp} disabled={!ready} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50 sm:min-h-0 sm:w-auto sm:justify-start sm:px-2.5 sm:py-1.5 sm:text-xs">
            <NotebookPen className="h-3.5 w-3.5" /> Add my note at this moment
          </button>
        )}
        <p className="text-xs text-muted-foreground">{failed ? "Playing in a basic player. Timestamps in your notes still work." : ready ? `Stamps your note with the time, like ${timeLabel(225)}, and links back to it.` : "Loading the player…"}</p>
      </div>
    </section>
  );
}
