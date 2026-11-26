/** Videos a note was built from, and notes you take while watching them. All pure text work, so it is easy to test. */

export type NoteVideo = { id: string; url: string; title: string };

/** The 11 character video id in a YouTube watch or youtu.be link, or null. */
export function videoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^(www|m|music)\./i, "").toLowerCase();
    const id = host === "youtu.be" ? u.pathname.slice(1) : host === "youtube.com" || host === "youtube-nocookie.com" ? (u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(?:embed|shorts|live)\/([\w-]{11})/.exec(u.pathname)?.[1]) : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Seconds in a link's `t` or `start` parameter: 225, 225s, 3m45s or 1h2m3s. */
export function linkSeconds(url: string): number {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get("t") ?? u.searchParams.get("start") ?? new URLSearchParams(u.hash.slice(1)).get("t") ?? "";
    if (/^\d+$/.test(raw)) return Number(raw);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(raw);
    return m && raw ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
  } catch { return 0; }
}

export const timestampUrl = (id: string, seconds: number) => `https://www.youtube.com/watch?v=${id}${seconds > 0 ? `&t=${Math.floor(seconds)}s` : ""}`;

export function timeLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * The videos a note was made from: YouTube links on its "Source:" lines (as imports and research write them).
 * A link someone merely pasted into their writing doesn't turn a note into a video note.
 */
export function sourceVideos(markdown: string): NoteVideo[] {
  const found = new Map<string, NoteVideo>();
  for (const line of markdown.matchAll(/^[*_\s]*Source:\s*(.+?)[*_\s]*$/gim)) {
    const text = line[1]!;
    const linked = new Set<string>();
    for (const m of text.matchAll(/\[([^\]]*)\]\((https?:[^)\s]+)\)/g)) {
      const id = videoId(m[2]!);
      linked.add(m[2]!);
      if (id && !found.has(id)) found.set(id, { id, url: timestampUrl(id, 0), title: m[1]!.trim() || "Video" });
    }
    for (const m of text.matchAll(/https?:\/\/[^\s)\]]+/g)) {
      if (linked.has(m[0])) continue;
      const id = videoId(m[0]);
      if (id && !found.has(id)) found.set(id, { id, url: timestampUrl(id, 0), title: "Video" });
    }
  }
  return [...found.values()];
}

const MY_NOTES = "## My notes";

/** Add "- [3:45](link) " to the end of a note, under a "My notes" heading, ready for the person to type after it. */
export function appendMyNote(markdown: string, id: string, seconds: number): string {
  const base = markdown.replace(/\s+$/, "");
  const head = new RegExp(`^${MY_NOTES}\\s*$`, "m").test(base) ? "" : `\n\n${MY_NOTES}`;
  return `${base}${head}\n- [${timeLabel(seconds)}](${timestampUrl(id, seconds)}) `;
}

/** The "Source:" link an import writes into every note: a video keeps its own title, a page its site name. */
export function sourceLink(kind: "website" | "youtube", title: string, url: string): string {
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep the raw address */ }
  const text = (kind === "youtube" && title.trim() ? title : host).replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
  return `[${text}](${url})`;
}
