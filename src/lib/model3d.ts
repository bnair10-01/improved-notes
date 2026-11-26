export const SHAPES = ["box", "cylinder", "sphere", "cone", "torus", "capsule"] as const;
export type Shape = (typeof SHAPES)[number];
export type Vec3 = [number, number, number];
export type Part = {
  id: string; name: string; description: string; group: string; shape: Shape;
  size: number[]; position: Vec3; rotation: Vec3; color: string;
  explode_direction: Vec3; assembly_order: number; note?: string; children_model?: Spec;
  /** 1 is solid. Lower values make a shell or container see-through, so the parts inside show. */
  opacity?: number;
  /** A short passage from the person's note that this part comes from (checked against the note before it is kept). */
  source_quote?: string;
  /** Set on the extra copies of a repeated part; the id of the part they repeat. */
  instance_of?: string;
};
export type Spec = { title: string; summary: string; parts: Part[] };
export const ARRANGEMENTS = ["single", "ring", "line", "scatter"] as const;
const hash01 = (str: string, k: number) => { let h = 2166136261 ^ k; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822519); return ((h >>> 0) % 10000) / 10000; };
const palette = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];
const record = (x: unknown): Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const text = (x: unknown, fallback = "", limit = 2000) => typeof x === "string" ? x.trim().slice(0, limit) : fallback;
const number = (x: unknown, fallback: number, lo: number, hi: number) => typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;
const vector = (x: unknown, fallback: Vec3, limit = 100): Vec3 => {
  const a = Array.isArray(x) ? x : [];
  return [0, 1, 2].map((i) => number(a[i], fallback[i] ?? 0, -limit, limit)) as Vec3;
};
/** Never fabricates parts to meet the generation target of 8–30. Root depth is zero. */
export function validateSpec(raw: unknown, depth = 0): Spec {
  if (!Number.isInteger(depth) || depth < 0 || depth > 2) throw new Error("Model depth must be between 0 and 2");
  const r = record(raw), ids = new Set<string>();
  const parts: Part[] = [];
  let primaries = 0;
  for (const value of Array.isArray(r['parts']) ? r['parts'] : []) {
    const p = record(value);
    if (!SHAPES.includes(p['shape'] as Shape)) continue;
    if (primaries === 30) break;
    const i = primaries++;
    const base = text(p['id'], `part-${i + 1}`, 80) || `part-${i + 1}`;
    let primaryId = base, suffix = 2;
    while (ids.has(primaryId)) primaryId = `${base}-${suffix++}`;
    const size = Array.isArray(p['size']) ? p['size'] : [];
    const size3 = [0, 1, 2].map((j) => number(size[j], 1, 0.02, 50));
    const pos0 = vector(p['position'], [0, 0, 0]);
    const rot0 = vector(p['rotation'], [0, 0, 0], Math.PI * 2);
    const copies = Math.round(number(p['copies'], 1, 1, 12));
    const arrange = (ARRANGEMENTS as readonly string[]).includes(String(p['arrange'])) ? String(p['arrange']) : "ring";
    const spread = number(p['arrange_radius'], 1.5, 0.1, 20);
    const color = typeof p['color'] === "string" && /^#[\da-f]{6}$/i.test(p['color']) ? p['color'] : palette[i % palette.length]!;
    for (let k = 0; k < copies; k++) {
      if (parts.length >= 80) break;
      let position: Vec3 = pos0, rotation: Vec3 = rot0;
      if (copies > 1) {
        const ang = (2 * Math.PI * k) / copies;
        if (arrange === "line") position = [pos0[0] + (k - (copies - 1) / 2) * spread, pos0[1], pos0[2]];
        else if (arrange === "scatter") position = [pos0[0] + (hash01(primaryId, k * 3) * 2 - 1) * spread, pos0[1] + (hash01(primaryId, k * 3 + 1) * 2 - 1) * spread, pos0[2] + (hash01(primaryId, k * 3 + 2) * 2 - 1) * spread];
        else { position = [pos0[0] + Math.cos(ang) * spread, pos0[1], pos0[2] + Math.sin(ang) * spread]; rotation = [rot0[0], rot0[1] - ang, rot0[2]]; }
      }
      let id = k === 0 ? primaryId : `${primaryId}-${k + 1}`;
      while (k > 0 && ids.has(id)) id = `${id}x`;
      ids.add(id);
      const part: Part = {
        id, name: text(p['name'], `Part ${i + 1}`, 160) || `Part ${i + 1}`,
        description: text(p['description']), group: text(p['group'], "Assembly", 160),
        shape: p['shape'] as Shape, size: size3, position, rotation, color,
        // Copies of a repeated part each point away from the middle, so they separate when the model is taken apart.
        explode_direction: copies > 1 || !Array.isArray(p['explode_direction']) ? centroidDirection(position, [0, 0, 0]) : vector(p['explode_direction'], centroidDirection(position, [0, 0, 0])),
        assembly_order: Math.round(number(p['assembly_order'], i + 1, 1, 30)),
      };
      if (k > 0) part.instance_of = primaryId;
      if (typeof p['opacity'] === "number") part.opacity = number(p['opacity'], 1, 0.08, 1);
      if (typeof p['source_quote'] === "string" && p['source_quote'].trim()) part.source_quote = text(p['source_quote'], "", 300);
      if (typeof p['note'] === "string") part.note = text(p['note'], "", 5000);
      if (k === 0 && depth < 2 && p['children_model'] && typeof p['children_model'] === "object") part.children_model = validateSpec(p['children_model'], depth + 1);
      parts.push(part);
    }
  }
  return { title: text(r['title'], "Concept model", 200) || "Concept model", summary: text(r['summary'], "", 5000), parts };
}

/** Scale the whole model to a comfortable size around the origin, and keep every part big enough to see. */
export function fitToView(parts: Part[], target = 4.2) {
  if (!parts.length) return;
  const extent = Math.max(...parts.flatMap((p) => [0, 1, 2].map((j) => Math.abs(p.position[j]!) + (p.size[j] ?? 1) / 2)));
  if (extent > 0 && (extent < target * 0.7 || extent > target * 1.4)) {
    const k = Math.min(12, Math.max(0.02, target / extent));
    for (const p of parts) { p.position = p.position.map((v) => v * k) as Vec3; p.size = p.size.map((v) => v * k); }
  }
  for (const p of parts) p.size = p.size.map((v) => Math.max(0.12, v));
}

/** Drop any part quote that does not really appear in the note it claims to come from. */
export function verifyPartQuotes<T extends { parts: Part[] }>(spec: T, noteText: string): T {
  const norm = (x: string) => x.toLowerCase().replace(/[*_#>`~|[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const hay = norm(noteText);
  for (const p of spec.parts) if (p.source_quote && (p.source_quote.length < 8 || !hay.includes(norm(p.source_quote)))) delete p.source_quote;
  return spec;
}
/** Unit vector away from the assembly centroid; coincident points use a stable upward direction. */
export function centroidDirection(position: Vec3, center: Vec3): Vec3 {
  const p = vector(position, [0, 0, 0]), c = vector(center, [0, 0, 0]);
  const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const length = Math.hypot(...d);
  return length < 1e-9 ? [0, 1, 0] : d.map((v) => v / length) as Vec3;
}
/** Translation delta, not an absolute position. t is normalized to 0–1. */
export function explodeOffset(part: Pick<Part, 'explode_direction'>, t: number, scale: number): Vec3 {
  const amount = number(t, 0, 0, 1) * number(scale, 0, 0, 100);
  return vector(part.explode_direction, [0, 1, 0]).map((v) => v * amount) as Vec3;
}
export function partsToNodes(spec: Spec, modelNoteId: string): { id: string; label: string; summary: string; parent_id: string | null }[] {
  const nodes = [{ id: modelNoteId, label: spec.title, summary: spec.summary, parent_id: null as string | null }];
  const walk = (s: Spec, parent: string) => {
    for (const p of s.parts) {
      if (p.instance_of) continue; // copies of a repeated part are one part
      const id = `${parent}/${encodeURIComponent(p.id)}`;
      nodes.push({ id, label: p.name, summary: p.description, parent_id: parent });
      if (p.children_model) walk(p.children_model, id);
    }
  };
  walk(spec, modelNoteId);
  return nodes;
}
/** Returns the valid part prefix of a breadcrumb path. */
export function findPath(spec: Spec, partIds: readonly string[]): Part[] {
  const path: Part[] = [];
  let current: Spec | undefined = spec;
  for (const id of partIds.slice(0, 3)) {
    const part: Part | undefined = current?.parts.find((p) => p.id === id);
    if (!part) break;
    path.push(part); current = part.children_model;
  }
  return path;
}
export type ModelEmbedMatch = { title: string; start: number; end: number; raw: string };
/** Offsets are UTF-16 indices, suitable for String.slice. Ignores fenced and inline code. */
export function parseModelEmbeds(md: string): ModelEmbedMatch[] {
  const masked = md.replace(/(^|\n)( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\3[^\n]*(?=\n|$)|$)|(`+)[^\n]*?\4/g, (s) => s.replace(/[^\n]/g, ' '));
  const result: ModelEmbedMatch[] = [];
  for (const m of masked.matchAll(/!\[\[model:\s*([^\]\n]+?)\s*\]\]/gi)) {
    const start = m.index, title = m[1]?.trim();
    if (!title) continue;
    let slashes = 0;
    for (let i = start - 1; i >= 0 && md[i] === '\\'; i--) slashes++;
    if (slashes % 2) continue;
    result.push({ title, start, end: start + m[0].length, raw: md.slice(start, start + m[0].length) });
  }
  return result;
}

/** What to model. Opened from a note, that is the note itself; anything the person adds only steers it. */
export function modelConcept(noteTitle: string, extra = ""): string {
  const title = noteTitle.trim() || "this note";
  const steer = extra.trim();
  return (steer ? `${title}: ${steer}` : title).slice(0, 1000);
}
