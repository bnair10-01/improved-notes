export type ShapeKind = "rectangle" | "ellipse" | "diamond" | "text" | "sticky" | "arrow" | "line";
export type AiShape = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  from: string | null;
  to: string | null;
};
export type AiDiagram = { title: string; page: number; description: string; shapes: AiShape[] };
/** Stored diagram: Excalidraw scene elements (opaque JSON). */
export type Diagram = { id: string; title: string; page: number; elements: unknown[] };

const STICKY = "#fff3bf";

/** Turn AI shapes into Excalidraw "skeleton" elements (fed to convertToExcalidrawElements). */
export function toSkeleton(shapes: AiShape[]): Record<string, unknown>[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  return shapes.map((s) => {
    if (s.kind === "arrow" || s.kind === "line") {
      const a = s.from ? byId.get(s.from) : undefined;
      const b = s.to ? byId.get(s.to) : undefined;
      const x = a ? a.x + a.width / 2 : s.x;
      const y = a ? a.y + a.height / 2 : s.y;
      const ex = b ? b.x + b.width / 2 : s.x + s.width;
      const ey = b ? b.y + b.height / 2 : s.y + s.height;
      return {
        type: s.kind, x, y, width: ex - x, height: ey - y,
        points: [[0, 0], [ex - x, ey - y]],
        ...(s.kind === "arrow" && a ? { start: { id: a.id } } : {}),
        ...(s.kind === "arrow" && b ? { end: { id: b.id } } : {}),
        ...(s.text ? { label: { text: s.text } } : {}),
        strokeColor: "#1e1e1e",
      };
    }
    if (s.kind === "text") return { type: "text", id: s.id, x: s.x, y: s.y, text: s.text || " ", fontSize: 20 };
    const base = { id: s.id, x: s.x, y: s.y, width: Math.max(40, s.width), height: Math.max(30, s.height), strokeColor: "#1e1e1e" };
    const label = s.text ? { label: { text: s.text } } : {};
    if (s.kind === "sticky") return { ...base, type: "rectangle", backgroundColor: STICKY, fillStyle: "solid", ...label };
    return { ...base, type: s.kind, ...label };
  });
}
