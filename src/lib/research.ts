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

const STOP = new Set("about above after again against also always because been before being between both could does doing down during each either even every from further have having here however into itself just keep known later like made make many might more most much must never only other over same should since some such than that their them then there these they this those through under until upon very were what when where which while whose will with within without would your yours the and for are but not you all can had her was one our out has his how its who did get may use used using each".split(" "));

/**
 * Ideas to look into, taken from the notes themselves (no AI, instant): the headings, bold terms, [[links]] and
 * capitalised names the writer used, then the words that keep coming up. Skips the title, which is what you started from.
 */
export function researchIdeas(text: string, title = "", limit = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>([title.trim().toLowerCase()]);
  const add = (raw: string) => {
    const t = raw.replace(/[*_`#>[\]()]/g, " ").replace(/\s+/g, " ").trim().replace(/[.:;,]+$/, "");
    const k = t.toLowerCase();
    if (t.length < 4 || t.length > 40 || seen.has(k) || /^\d+$/.test(t) || t.split(" ").every((w) => STOP.has(w.toLowerCase()))) return;
    seen.add(k); out.push(t);
  };
  for (const m of text.matchAll(/^#{1,3}\s+(.+)$/gm)) add(m[1]!);
  for (const m of text.matchAll(/\*\*([^*\n]{3,40})\*\*/g)) add(m[1]!);
  for (const m of text.matchAll(/\[\[([^\]\n|]{3,40})(?:\|[^\]\n]*)?\]\]/g)) add(m[1]!);
  for (const m of text.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\b/gm)) add(m[1]!);
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [w] of [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])) add(w);
  return out.slice(0, limit);
}
