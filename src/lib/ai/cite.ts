/** Where an AI answer came from. Every source is numbered so the model can cite it as [1], [2]… */
export type SourceInput = { id?: string; kind?: string; title: string; text: string };
export type Source = SourceInput & { n: number };
export type Citation = { n: number; id?: string; kind?: string; title: string; quote: string };

const norm = (s: string) => s.toLowerCase().replace(/[*_#>`~|[\]()]/g, " ").replace(/\s+/g, " ").trim();

/** Number the sources and cut each one to its share of the budget. The cut text is what gets quoted and checked later. */
export function numberSources(inputs: SourceInput[], budget = 5000): { list: Source[]; context: string } {
  const per = Math.max(400, Math.floor(budget / Math.max(1, inputs.length)));
  const list = inputs.map((s, i) => ({ ...s, n: i + 1, text: s.text.trim().slice(0, per) }));
  return { list, context: list.map((s) => `[${s.n}] ${s.title}\n${s.text}`).join("\n\n") };
}

/** Split a note into numbered passages (paragraphs), so a summary can point at the part of the note it used. */
export function passagesOf(markdown: string, title: string, id?: string, kind?: string, maxPassages = 24, maxChars = 420): Source[] {
  const parts = markdown.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= maxChars) { out.push(p); continue; }
    for (let i = 0; i < p.length; i += maxChars) out.push(p.slice(i, i + maxChars));
  }
  return out.slice(0, maxPassages).map((text, i) => ({ n: i + 1, title, text, ...(id ? { id } : {}), ...(kind ? { kind } : {}) }));
}

/** Citation numbers written in the text, like [2] or [1, 3], in order of first use. */
export function citedNumbers(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)) {
    for (const part of m[1]!.split(",")) { const n = Number(part.trim()); if (!seen.includes(n)) seen.push(n); }
  }
  return seen;
}

/** Keep only citations that point at a real source and quote something that is really in it. */
export function verifyCitations(raw: unknown, list: Source[]): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const c of raw) {
    const n = Number((c as { n?: unknown })?.n);
    const quote = String((c as { quote?: unknown })?.quote ?? "").trim();
    const src = list.find((s) => s.n === n);
    if (!src || quote.length < 8) continue;
    if (!norm(src.text).includes(norm(quote))) continue;
    if (out.some((o) => o.n === n && norm(o.quote) === norm(quote))) continue;
    out.push({ n, title: src.title, quote, ...(src.id ? { id: src.id } : {}), ...(src.kind ? { kind: src.kind } : {}) });
  }
  return out;
}

/** The sources a text actually cites, as a list a reader can follow. Unknown numbers are dropped. */
export function citedSources(text: string, list: Source[]): Source[] {
  return citedNumbers(text).flatMap((n) => list.find((s) => s.n === n) ?? []);
}
