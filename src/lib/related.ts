import { words } from "./retrieve";
import type { VNote } from "./vault";

export type Related = { a: string; b: string; score: number; shared: string[] };

type Doc = { id: string; tf: Map<string, number>; norm: number };

/**
 * Connect notes automatically from what they say. Terms are weighted so rare shared ideas count more than common
 * words (TF-IDF), and two notes are related when their cosine similarity is high enough. Runs instantly, on the device.
 * Pairs already linked by hand or by [[wikilinks]] are left out, since those are drawn separately.
 */
export function relatedPairs(
  notes: Pick<VNote, "id" | "title" | "markdown">[],
  opts: { minScore?: number; perNote?: number; skip?: Set<string> } = {},
): Related[] {
  const { minScore = 0.08, perNote = 3, skip = new Set<string>() } = opts;
  const tokens = (n: Pick<VNote, "title" | "markdown">) => words(`${n.title} ${n.title} ${n.markdown}`).filter((w) => w.length >= 3);
  const raw = notes.map((n) => ({ id: n.id, toks: tokens(n) })).filter((d) => d.toks.length >= 3);
  if (raw.length < 2) return [];

  const df = new Map<string, number>();
  for (const d of raw) for (const w of new Set(d.toks)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = raw.length;
  const idf = (w: string) => Math.log((N + 1) / ((df.get(w) ?? 0) + 1)) + 1;

  const docs: Doc[] = raw.map((d) => {
    const counts = new Map<string, number>();
    for (const w of d.toks) counts.set(w, (counts.get(w) ?? 0) + 1);
    const tf = new Map<string, number>();
    let sq = 0;
    for (const [w, c] of counts) { const wt = (1 + Math.log(c)) * idf(w); tf.set(w, wt); sq += wt * wt; }
    return { id: d.id, tf, norm: Math.sqrt(sq) };
  });

  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const all: Related[] = [];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const A = docs[i]!, B = docs[j]!;
      if (skip.has(key(A.id, B.id))) continue;
      let dot = 0;
      const shared: [string, number][] = [];
      for (const [w, wa] of A.tf) { const wb = B.tf.get(w); if (wb) { dot += wa * wb; shared.push([w, wa * wb]); } }
      if (!shared.length) continue;
      const score = dot / (A.norm * B.norm);
      if (score >= minScore) all.push({ a: A.id, b: B.id, score, shared: shared.sort((x, y) => y[1] - x[1]).slice(0, 4).map(([w]) => w) });
    }
  }
  // Keep each note's strongest few, so the graph stays readable.
  const used = new Map<string, number>();
  const out: Related[] = [];
  for (const r of all.sort((x, y) => y.score - x.score)) {
    if ((used.get(r.a) ?? 0) >= perNote || (used.get(r.b) ?? 0) >= perNote) continue;
    used.set(r.a, (used.get(r.a) ?? 0) + 1); used.set(r.b, (used.get(r.b) ?? 0) + 1);
    out.push(r);
  }
  return out;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
