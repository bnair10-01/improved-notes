import { describe, expect, it } from "vitest";
import { toSkeleton, type AiShape } from "./diagram-types";

const box = (id: string, x: number): AiShape => ({ id, kind: "rectangle", x, y: 0, width: 100, height: 50, text: id, from: null, to: null });

describe("diagram skeleton", () => {
  it("arrows bind to the shapes they connect", () => {
    const out = toSkeleton([box("a", 0), box("b", 300), { id: "x", kind: "arrow", x: 0, y: 0, width: 0, height: 0, text: "", from: "a", to: "b" }]);
    expect(out[2]).toMatchObject({ start: { id: "a" }, end: { id: "b" }, x: 50, y: 25 });
  });
  it("sticky notes become filled rectangles", () => {
    expect(toSkeleton([{ ...box("s", 0), kind: "sticky" }])[0]).toMatchObject({ type: "rectangle", fillStyle: "solid" });
  });
});
