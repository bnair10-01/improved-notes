/** Turning one big piece of material (a web page, a video, a lecture, a deck) into several small linked notes. */
export type Section = { title: string; markdown: string; source_quote?: string };
export type ParsedMaterial = { title: string; overview: string; sections: Section[] };
export type NotePlan = { title: string; markdown: string };

const clean = (s: string) => s.replace(/\s+$/g, "").replace(/^\n+/, "");

/**
 * Read "# Title", an overview paragraph, then "## Section" blocks. If there are no sections the body is cut into a few
 * parts at paragraph breaks, so a flat answer still becomes several notes.
 */
export function parseSections(md: string): ParsedMaterial {
  const lines = md.replace(/\r/g, "").split("\n");
  let title = "";
  const head: string[] = [];
  const sections: Section[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h1 && !title && !cur) { title = h1[1]!.trim(); continue; }
    if (h2) { if (cur) sections.push({ title: cur.title, markdown: clean(cur.body.join("\n")) }); cur = { title: h2[1]!.trim(), body: [] }; continue; }
    (cur ? cur.body : head).push(line);
  }
  if (cur) sections.push({ title: cur.title, markdown: clean(cur.body.join("\n")) });
  const good = sections.filter((s) => s.markdown.trim());
  if (good.length) return { title, overview: clean(head.join("\n")), sections: good };

  // No headings: split the text into up to four parts at paragraph breaks.
  const paras = clean(head.join("\n")).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length < 3) return { title, overview: "", sections: paras.length ? [{ title: title || "Notes", markdown: paras.join("\n\n") }] : [] };
  const [first, ...rest] = paras;
  const size = Math.ceil(rest.length / Math.min(4, rest.length));
  const parts: Section[] = [];
  for (let i = 0; i < rest.length; i += size) {
    const body = rest.slice(i, i + size).join("\n\n");
    const t = /^[^.!?\n]{4,60}/.exec(body)?.[0]?.trim() ?? `Part ${parts.length + 1}`;
    parts.push({ title: t, markdown: body });
  }
  return { title, overview: first ?? "", sections: parts };
}

const unique = (title: string, taken: Set<string>) => {
  let t = title.trim() || "Untitled", n = 2;
  while (taken.has(t.toLowerCase())) t = `${title.trim()} (${n++})`;
  taken.add(t.toLowerCase());
  return t;
};

/** The notes to create: an overview that links to every part, and one self-contained note per part that links back. */
export function planSplit(opts: { topic: string; overview: string; sections: Section[]; source?: string; existingTitles?: Iterable<string> }): NotePlan[] {
  const taken = new Set([...(opts.existingTitles ?? [])].map((t) => t.toLowerCase()));
  const overviewTitle = unique(`${opts.topic}: overview`, taken);
  const titles = opts.sections.map((s) => unique(s.title, taken));
  const sourceLine = opts.source ? `\n\nSource: ${opts.source}` : "";
  const overview: NotePlan = {
    title: overviewTitle,
    markdown: `${opts.overview.trim()}${opts.overview.trim() ? "\n\n" : ""}## Notes in this topic\n${titles.map((t) => `- [[${t}]]`).join("\n")}${sourceLine}\n`,
  };
  const parts = opts.sections.map((s, i): NotePlan => ({
    title: titles[i]!,
    markdown: `${s.markdown.trim()}\n\n---\nPart of [[${overviewTitle}]]${sourceLine}\n`,
  }));
  return [overview, ...parts];
}

/** Keep a section's source quote only if it really appears in the material it was cut from. */
export function verifySectionQuotes(sections: Section[], material: string): Section[] {
  const norm = (x: string) => x.toLowerCase().replace(/[*_#>`~|[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const hay = norm(material);
  return sections.map((s) => {
    if (!s.source_quote) return s;
    const { source_quote, ...rest } = s;
    return source_quote.length >= 8 && hay.includes(norm(source_quote)) ? s : rest;
  });
}
