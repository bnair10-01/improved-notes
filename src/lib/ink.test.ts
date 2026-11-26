import { describe, expect, it } from "vitest";
import { MAX_INK_CHARS, parseInk, serializeInk, simplify } from "./ink";

describe("ink", () => {
  it("round-trips strokes", () => {
    const s = serializeInk([{ p: [[1, 2], [3.14159, 4]] }]);
    expect(parseInk(s)).toEqual([{ p: [[1, 2], [3.1, 4]] }]);
  });
  it("ignores malformed ink instead of throwing", () => {
    expect(parseInk("not json")).toEqual([]);
    expect(parseInk(undefined)).toEqual([]);
    expect(parseInk(JSON.stringify([{ p: [["a", 1]] }, { nope: 1 }, { p: [[1, 2]] }]))).toEqual([{ p: [[1, 2]] }]);
  });
  it("drops points that barely move but keeps both ends", () => {
    const pts: [number, number][] = [[0, 0], [0.2, 0], [0.4, 0], [10, 0], [10.1, 0], [20, 0]];
    const out = simplify(pts);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([20, 0]);
    expect(out.length).toBeLessThan(pts.length);
  });
  it("refuses ink too big to store", () => {
    const big = Array.from({ length: 1500 }, () => ({ p: Array.from({ length: 400 }, (_, i) => [i * 1.1, i * 2.3] as [number, number]) }));
    expect(serializeInk(big)).toBeNull();
    expect(MAX_INK_CHARS).toBeGreaterThan(0);
  });
});
