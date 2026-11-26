export const SHAPES = ["box", "cylinder", "sphere", "cone", "torus", "capsule"] as const;
export type Shape = (typeof SHAPES)[number];
export type Vec3 = [number, number, number];
export type Part = {
  id: string; name: string; description: string; group: string; shape: Shape;
  size: number[]; position: Vec3; rotation: Vec3; color: string;
  explode_direction: Vec3; assembly_order: number; note?: string; children_model?: Spec;
};
export type Spec = { title: string; summary: string; parts: Part[] };
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
  for (const value of Array.isArray(r['parts']) ? r['parts'] : []) {
    const p = record(value);
    if (!SHAPES.includes(p['shape'] as Shape)) continue;
    if (parts.length === 30) break;
    const i = parts.length;
    const base = text(p['id'], `part-${i + 1}`, 80) || `part-${i + 1}`;
    let id = base, suffix = 2;
    while (ids.has(id)) id = `${base}-${suffix++}`;
    ids.add(id);
    const size = Array.isArray(p['size']) ? p['size'] : [];
    const part: Part = {
      id, name: text(p['name'], `Part ${i + 1}`, 160) || `Part ${i + 1}`,
      description: text(p['description']), group: text(p['group'], "Assembly", 160),
      shape: p['shape'] as Shape,
      size: [0, 1, 2].map((j) => number(size[j], 1, 0.02, 50)),
      position: vector(p['position'], [0, 0, 0]), rotation: vector(p['rotation'], [0, 0, 0], Math.PI * 2),
      color: typeof p['color'] === "string" && /^#[\da-f]{6}$/i.test(p['color']) ? p['color'] : palette[i % palette.length]!,
      explode_direction: vector(p['explode_direction'], centroidDirection(vector(p['position'], [0, 0, 0]), [0, 0, 0])),
      assembly_order: Math.round(number(p['assembly_order'], i + 1, 1, 30)),
    };
    if (typeof p['note'] === "string") part.note = text(p['note'], "", 5000);
    if (depth < 2 && p['children_model'] && typeof p['children_model'] === "object") part.children_model = validateSpec(p['children_model'], depth + 1);
    parts.push(part);
  }
  return { title: text(r['title'], "Concept model", 200) || "Concept model", summary: text(r['summary'], "", 5000), parts };
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
