import { describe, expect, it } from "vitest";
import { MAX_INK_CHARS, eraseAt, parseInk, serializeInk, simplify, widthFor } from "./ink";

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

  it("keeps pen pressure through saving and loading, and still reads older ink without it", () => {
    const saved = serializeInk([{ p: [[1, 2, 0.4567], [3, 4, 1]] }, { p: [[5, 6]] }]);
    expect(parseInk(saved)).toEqual([{ p: [[1, 2, 0.46], [3, 4, 1]] }, { p: [[5, 6]] }]);
  });
  it("makes firm pen strokes wider than light ones, and leaves unpressured ink at its base width", () => {
    expect(widthFor(2, 1)).toBeGreaterThan(widthFor(2, 0.1));
    expect(widthFor(2, undefined)).toBe(2);
    expect(widthFor(2, 5)).toBe(widthFor(2, 1)); // pressure is clamped
  });
  it("the eraser removes the strokes it touches, and nothing else", () => {
    const strokes = [{ p: [[0, 0], [100, 0]] as [number, number][] }, { p: [[0, 200], [100, 200]] as [number, number][] }, { p: [[500, 500]] as [number, number][] }];
    const after = eraseAt(strokes, 50, 5, 14);
    expect(after).toHaveLength(2);
    expect(after[0]!.p[0]).toEqual([0, 200]);
    expect(eraseAt(strokes, 300, 300, 14)).toBe(strokes); // untouched: same array, so nothing re-renders
    expect(eraseAt(strokes, 500, 505, 14)).toHaveLength(2); // a dot
  });
});
