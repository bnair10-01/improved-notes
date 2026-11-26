import { runModel, safe } from "./ai/run";

/** Looking a subject up: its Wikipedia article (read directly, no AI) and a few real YouTube videos (found by Gemini with Google Search, then checked with YouTube). */

export type WikiArticle = { title: string; url: string; text: string };
export type Video = { url: string; title: string; channel: string };
export type Research = { subject: string; wiki: WikiArticle | null; videos: Video[] };

const TAIL = /^See also|^Notes?$|^References?$|^Further reading|^External links|^Citations?$|^Bibliography|^Sources?$|^Footnotes?$/i;

/** Wikipedia's plain text without the reference lists at the end, trimmed to what a study note needs. */
export function cleanWikiText(text: string, max = 45_000): string {
  const out: string[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const h = /^==\s*([^=].*?)\s*==$/.exec(line.trim());
    if (h && TAIL.test(h[1]!.trim())) break;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

const YT = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s)\]>"']*?v=|youtu\.be\/)([\w-]{11})/gi;

/** The distinct YouTube watch links in a piece of text, in order, normalised. */
export function extractYouTubeUrls(text: string, limit = 6): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(YT)) seen.add(`https://www.youtube.com/watch?v=${m[1]}`);
  return [...seen].slice(0, limit);
}

const WIKI = "https://en.wikipedia.org/w/api.php";

/** The best matching English Wikipedia article for a subject, skipping disambiguation pages. Null when there isn't one. */
export async function wikipediaFor(subject: string): Promise<WikiArticle | null> {
  const q = new URLSearchParams({ action: "query", generator: "search", gsrsearch: subject, gsrlimit: "4", prop: "pageprops", ppprop: "disambiguation", format: "json", origin: "*" });
  const hits = await (await fetch(`${WIKI}?${q}`)).json() as { query?: { pages?: Record<string, { title: string; index: number; pageprops?: object }> } };
  const best = Object.values(hits.query?.pages ?? {}).sort((a, b) => a.index - b.index).find((p) => !p.pageprops);
  if (!best) return null;
  const x = new URLSearchParams({ action: "query", titles: best.title, prop: "extracts", explaintext: "1", exsectionformat: "wiki", redirects: "1", format: "json", origin: "*" });
  const body = await (await fetch(`${WIKI}?${x}`)).json() as { query?: { pages?: Record<string, { extract?: string }> } };
  const text = cleanWikiText(Object.values(body.query?.pages ?? {})[0]?.extract ?? "");
  if (text.split(/\s+/).length < 80) return null;
  return { title: best.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(best.title.replace(/ /g, "_"))}`, text };
}

/** Ask YouTube about a link. A made-up or removed video fails here and never reaches the person. */
async function checkVideo(url: string): Promise<Video | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!r.ok) return null;
    const j = await r.json() as { title?: string; author_name?: string };
    return j.title ? { url, title: j.title, channel: j.author_name ?? "" } : null;
  } catch { return null; }
}

/** Gemini searches the web for explainers; only links YouTube confirms exist are kept. Cloud only (search needs it). */
export async function findVideos(subject: string): Promise<Video[]> {
  const { text } = await runModel({
    task: "research", chars: 4000, tools: [{ googleSearch: {} }],
    instructions:
      `Use Google Search to find up to 4 YouTube videos that explain "${subject}" clearly to a student: lectures or explainers from reputable channels, roughly 5 to 45 minutes, in English. ` +
      "Reply with one full youtube.com/watch link per line and nothing else. Only include videos you actually found in search results.",
  });
  const checked = await Promise.all(extractYouTubeUrls(text, 6).map(checkVideo));
  return checked.filter((v): v is Video => !!v).slice(0, 4);
}

/** Wikipedia and videos together. Either side may come back empty; only both failing is an error. */
export const researchSubject = (subject: string) =>
  safe("research", async () => {
    const s = subject.trim();
    const [wiki, videos] = await Promise.allSettled([wikipediaFor(s), findVideos(s)]);
    const result: Research = { subject: s, wiki: wiki.status === "fulfilled" ? wiki.value : null, videos: videos.status === "fulfilled" ? videos.value : [] };
    if (!result.wiki && !result.videos.length) {
      const err = [wiki, videos].find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
      if (err && videos.status === "rejected") throw videos.reason;
      throw new Error(`I couldn't find a Wikipedia article or videos for “${s}”. Try different words.`);
    }
    return { research: result };
  });
