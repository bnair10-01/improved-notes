/** Pen strokes on a note. Points are in "units" of 1/1000 of the page width so ink scales with the window. */
export type Stroke = { p: [number, number][] };

const MAX_STROKES = 1500;
const MAX_POINTS = 400;
export const MAX_INK_CHARS = 700_000; // Firestore documents are limited to ~1 MB

/** Drop points that barely move, so ink stays small without looking different. */
export function simplify(points: [number, number][], minDist = 1.5): [number, number][] {
  if (points.length <= 2) return points;
  const out: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1]!;
    if (Math.hypot(points[i]![0] - last[0], points[i]![1] - last[1]) >= minDist) out.push(points[i]!);
  }
  out.push(points[points.length - 1]!);
  return out.length > MAX_POINTS ? out.filter((_, i) => i % Math.ceil(out.length / MAX_POINTS) === 0 || i === out.length - 1) : out;
}

export function parseInk(raw: unknown): Stroke[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.slice(0, MAX_STROKES).flatMap((s): Stroke[] => {
      const pts = (s as { p?: unknown })?.p;
      if (!Array.isArray(pts)) return [];
      const clean = pts.filter((q): q is [number, number] => Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === "number" && Number.isFinite(n)));
      return clean.length ? [{ p: clean }] : [];
    });
  } catch { return []; }
}

/** Returns null when the ink has grown too large to store, so the caller can warn instead of silently dropping it. */
export function serializeInk(strokes: Stroke[]): string | null {
  const s = JSON.stringify(strokes.map((st) => ({ p: st.p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) })));
  return s.length > MAX_INK_CHARS ? null : s;
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, color: string, lineWidth = 2) {
  const k = width / 1000;
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const st of strokes) {
    if (!st.p.length) continue;
    ctx.beginPath();
    st.p.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    if (st.p.length === 1) ctx.lineTo(st.p[0]![0] * k + 0.01, st.p[0]![1] * k);
    ctx.stroke();
  }
}
