/** Pen strokes on a note. Points are in "units" of 1/1000 of the page width so ink scales with the window. */
/** A point is x, y and, for a pen, how hard it was pressed (0 to 1). Touch and mouse leave the pressure out. */
export type Pt = [number, number] | [number, number, number];
export type Stroke = { p: Pt[] };

const MAX_STROKES = 1500;
const MAX_POINTS = 400;
export const MAX_INK_CHARS = 700_000; // Firestore documents are limited to ~1 MB

/** Drop points that barely move, so ink stays small without looking different. */
export function simplify<T extends Pt>(points: T[], minDist = 1.5): T[] {
  if (points.length <= 2) return points;
  const out: T[] = [points[0]!];
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
      const clean = pts.filter((q): q is Pt => Array.isArray(q) && (q.length === 2 || q.length === 3) && q.every((n) => typeof n === "number" && Number.isFinite(n)));
      return clean.length ? [{ p: clean }] : [];
    });
  } catch { return []; }
}

/** Returns null when the ink has grown too large to store, so the caller can warn instead of silently dropping it. */
export function serializeInk(strokes: Stroke[]): string | null {
  const s = JSON.stringify(strokes.map((st) => ({ p: st.p.map(([x, y, f]) => (f === undefined ? [Math.round(x * 10) / 10, Math.round(y * 10) / 10] : [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(f * 100) / 100])) })));
  return s.length > MAX_INK_CHARS ? null : s;
}

/** How wide a pen line is at a given pressure: light touches are fine, firm ones bold. Without pressure it's the base width. */
export const widthFor = (base: number, pressure: number | undefined) => (pressure === undefined ? base : base * (0.35 + 1.4 * Math.min(1, Math.max(0, pressure))));

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, color: string, lineWidth = 2) {
  const k = width / 1000;
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const st of strokes) {
    const pts = st.p;
    if (!pts.length) continue;
    if (pts.length === 1) { ctx.beginPath(); ctx.moveTo(pts[0]![0] * k, pts[0]![1] * k); ctx.lineTo(pts[0]![0] * k + 0.01, pts[0]![1] * k); ctx.lineWidth = widthFor(lineWidth, pts[0]![2]); ctx.stroke(); continue; }
    if (pts.some((q) => q[2] !== undefined)) {
      // A pen: each little segment takes the width of the pressure there, joined smoothly through the midpoints.
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        ctx.lineWidth = widthFor(lineWidth, b[2] ?? a[2]);
        ctx.beginPath(); ctx.moveTo(a[0] * k, a[1] * k);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        ctx.quadraticCurveTo(a[0] * k, a[1] * k, mx * k, my * k); ctx.lineTo(b[0] * k, b[1] * k); ctx.stroke();
      }
      continue;
    }
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.stroke();
  }
}

const near = (a: Pt, b: Pt, x: number, y: number, r: number) => {
  // distance from (x, y) to the segment a-b
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= r;
};

/** The eraser: drop every stroke that passes within `radius` of a point. Returns the same array when nothing was touched. */
export function eraseAt(strokes: Stroke[], x: number, y: number, radius = 14): Stroke[] {
  const keep = strokes.filter((st) => !(st.p.length === 1 ? Math.hypot(st.p[0]![0] - x, st.p[0]![1] - y) <= radius : st.p.some((q, i) => i > 0 && near(st.p[i - 1]!, q, x, y, radius))));
  return keep.length === strokes.length ? strokes : keep;
}
