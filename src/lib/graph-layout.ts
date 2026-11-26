export type Vec3 = [number, number, number];

/** A small deterministic pseudo-random generator, so the same notes always get the same layout. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}
const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * Place nodes in 3D with a force-directed layout: every pair repels, linked pairs attract, so connected notes
 * cluster together and unrelated groups drift apart. Deterministic for the same input.
 */
export function forceLayout3d(ids: string[], edges: [string, string][], { iterations = 260, spread = 7, gravity = 1 }: { iterations?: number; spread?: number; gravity?: number } = {}): Map<string, Vec3> {
  const n = ids.length;
  const pos = new Map<string, Vec3>();
  if (!n) return pos;
  if (n === 1) { pos.set(ids[0]!, [0, 0, 0]); return pos; }

  const idx = new Map(ids.map((id, i) => [id, i]));
  const P = ids.map((id) => {
    const r = rng(hash(id));
    const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const rad = spread * (0.6 + r() * 0.4);
    return [rad * s * Math.cos(t), rad * u, rad * s * Math.sin(t)] as Vec3;
  });
  const E = edges.flatMap(([a, b]) => (idx.has(a) && idx.has(b) && a !== b ? [[idx.get(a)!, idx.get(b)!] as [number, number]] : []));
  const k = spread / Math.cbrt(n) * 1.6; // ideal distance between neighbours
  let temp = spread / 3;

  for (let it = 0; it < iterations; it++) {
    const D: Vec3[] = P.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = P[i]![0] - P[j]![0], dy = P[i]![1] - P[j]![1], dz = P[i]![2] - P[j]![2];
      const d = Math.max(0.01, Math.hypot(dx, dy, dz));
      const f = (k * k) / d; // repulsion
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
      D[i]![0] += fx; D[i]![1] += fy; D[i]![2] += fz; D[j]![0] -= fx; D[j]![1] -= fy; D[j]![2] -= fz;
    }
    for (const [a, b] of E) {
      const dx = P[a]![0] - P[b]![0], dy = P[a]![1] - P[b]![1], dz = P[a]![2] - P[b]![2];
      const d = Math.max(0.01, Math.hypot(dx, dy, dz));
      const f = (d * d) / k; // attraction
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
      D[a]![0] -= fx; D[a]![1] -= fy; D[a]![2] -= fz; D[b]![0] += fx; D[b]![1] += fy; D[b]![2] += fz;
    }
    for (let i = 0; i < n; i++) {
      // a gentle pull to the middle keeps separate groups from drifting off forever
      D[i]![0] -= P[i]![0] * gravity; D[i]![1] -= P[i]![1] * gravity; D[i]![2] -= P[i]![2] * gravity;
      const m = Math.hypot(...D[i]!) || 1;
      const step = Math.min(m, temp);
      P[i]![0] += (D[i]![0] / m) * step; P[i]![1] += (D[i]![1] / m) * step; P[i]![2] += (D[i]![2] / m) * step;
    }
    temp *= 0.985;
  }
  ids.forEach((id, i) => pos.set(id, P[i]!));
  return pos;
}

export const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
