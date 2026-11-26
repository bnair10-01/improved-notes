import type { MindMap } from "@/lib/mindmap-types";
import { childrenOf, rootId } from "@/lib/mindmap-types";

type V = [number, number, number];
const norm = (v: V): V => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Radial 3D layout: main branches spread over a sphere, sub-branches fan out in cones. */
export function layout3d(m: MindMap, visible: Set<string>): Record<string, V> {
  const out: Record<string, V> = {};
  const root = rootId(m);
  if (!root) return out;
  out[root] = [0, 0, 0];
  const branches = childrenOf(m, root).filter((n) => visible.has(n.id));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const place = (id: string, pos: V, dir: V, depth: number) => {
    const kids = childrenOf(m, id).filter((n) => visible.has(n.id));
    if (!kids.length) return;
    const up: V = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(dir, up)), w = norm(cross(dir, u));
    const spread = 0.9 / depth;
    const dist = 4.2 / Math.sqrt(depth);
    kids.forEach((k, i) => {
      const a = kids.length === 1 ? 0 : (i / kids.length) * Math.PI * 2;
      const r = kids.length === 1 ? 0 : spread;
      const d = norm([
        dir[0] + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * r,
        dir[1] + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * r,
        dir[2] + (u[2] * Math.cos(a) + w[2] * Math.sin(a)) * r,
      ]);
      const p: V = [pos[0] + d[0] * dist, pos[1] + d[1] * dist, pos[2] + d[2] * dist];
      out[k.id] = p;
      place(k.id, p, d, depth + 1);
    });
  };
  branches.forEach((b, i) => {
    const y = branches.length === 1 ? 0 : 1 - (i / (branches.length - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const t = golden * i;
    const dir = norm([Math.cos(t) * rad, y * 0.6, Math.sin(t) * rad]);
    const p: V = [dir[0] * 6, dir[1] * 6, dir[2] * 6];
    out[b.id] = p;
    place(b.id, p, dir, 2);
  });
  return out;
}
