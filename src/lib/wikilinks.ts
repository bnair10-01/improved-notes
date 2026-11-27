/** Pure helpers for [[wikilinks]]. No I/O here, so it is easy to test. */
export const WIKILINK_RE = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g;

export function parseWikilinks(md: string): string[] {
  const out = new Map<string, string>();
  for (const m of md.matchAll(WIKILINK_RE)) {
    const t = (m[1] ?? "").trim();
    if (t) out.set(t.toLowerCase(), t);
  }
  return [...out.values()];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rewrite [[Old]] and [[Old|alias]] to point at the new title. Case-insensitive on the old title. */
export function renameWikilinks(md: string, oldTitle: string, newTitle: string): string {
  const re = new RegExp(`\\[\\[\\s*${esc(oldTitle.trim())}\\s*(\\|[^\\[\\]\\n]*)?\\]\\]`, "gi");
  return md.replace(re, (_m, alias: string | undefined) => `[[${newTitle}${alias ?? ""}]]`);
}

/** Turn wikilinks into markdown links the reader can click. */
export function wikilinksToMarkdown(md: string): string {
  return md.replace(WIKILINK_RE, (_m, t: string, alias?: string) => `[${(alias || t).trim()}](#wl:${encodeURIComponent(t.trim())})`);
}

/** True if the note mentions the title as plain text outside a wikilink. */
export function mentionsTitle(md: string, title: string): boolean {
  if (title.trim().length < 3) return false;
  const plain = md.replace(WIKILINK_RE, "");
  return new RegExp(`(^|[^\\w])${esc(title.trim())}($|[^\\w])`, "i").test(plain);
}

/** Wrap the first plain mention of a title in [[ ]]. */
export function linkFirstMention(md: string, title: string): string {
  const re = new RegExp(`(^|[^\\w\\[])(${esc(title.trim())})(?=$|[^\\w\\]])`, "i");
  return md.replace(re, (_m, pre: string, word: string) => `${pre}[[${word}]]`);
}
