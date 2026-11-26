import { describe, expect, it } from 'vitest';
import { validateSpec, fitToView, tidyGenerated, verifyPartQuotes, centroidDirection, explodeOffset, partsToNodes, findPath, parseModelEmbeds } from './model3d';
const part = (extra = {}) => ({ id: 'a', name: 'Housing', shape: 'box', ...extra });
describe('validateSpec', () => {
  it('accepts fewer than eight, rejects invalid shapes, caps valid parts at thirty', () => {
    expect(validateSpec({ parts: [part(), part({ shape: 'code' })] }).parts).toHaveLength(1);
    expect(validateSpec({ parts: Array.from({ length: 40 }, () => part()) }).parts).toHaveLength(30);
    expect(validateSpec(null).parts).toEqual([]);
  });
  it('sanitizes numbers, colors and globally unique sibling ids including collisions', () => {
    const s = validateSpec({ parts: [part({ size: [-5, Infinity, 200], position: [NaN, 500, 'x'], color: 'url(x)' }), part(), part({ id: 'a-2' })] });
    expect(s.parts.map(p => p.id)).toEqual(['a', 'a-2', 'a-2-2']);
    expect(s.parts[0]?.size).toEqual([0.02, 1, 50]);
    expect(s.parts[0]?.position).toEqual([0, 100, 0]);
    expect(s.parts[0]?.color).toMatch(/^#[\da-f]{6}$/i);
  });
  it('retains child models only through depth two, even with cycles', () => {
    const raw: { parts: unknown[] } = { parts: [] }; raw.parts.push(part({ children_model: raw }));
    const s = validateSpec(raw);
    expect(s.parts[0]?.children_model?.parts[0]?.children_model?.parts[0]?.children_model).toBeUndefined();
    expect(() => validateSpec({}, 3)).toThrow();
  });
});
describe('math and navigation', () => {
  it('normalizes centroid directions and handles coincidence', () => {
    expect(centroidDirection([3, 4, 0], [0, 0, 0])).toEqual([0.6, 0.8, 0]);
    expect(centroidDirection([1, 1, 1], [1, 1, 1])).toEqual([0, 1, 0]);
  });
  it('clamps explosion and produces deltas', () => {
    const p = { explode_direction: [1, -1, 0] as [number, number, number] };
    expect(explodeOffset(p, 0.5, 4)).toEqual([2, -2, 0]);
    expect(explodeOffset(p, -5, 4)).toEqual([0, -0, 0]);
    expect(explodeOffset(p, 8, 4)).toEqual([4, -4, 0]);
  });
  it('creates collision-free hierarchy nodes and valid breadcrumb prefixes', () => {
    const s = validateSpec({ title: 'Motor', parts: [part({ children_model: { parts: [part()] } }), part({ id: 'a/b' })] });
    const nodes = partsToNodes(s, 'note');
    expect(new Set(nodes.map(n => n.id)).size).toBe(nodes.length);
    expect(nodes[2]?.parent_id).toBe('note/a');
    expect(findPath(s, ['a', 'a', 'missing']).map(p => p.id)).toEqual(['a', 'a']);
    expect(findPath(s, ['missing'])).toEqual([]);
  });
});
describe('parseModelEmbeds', () => {
  it('returns titles, raw matches and exact offsets', () => {
    const md = 'Hello ![[model: Motor ]] and ![[MODEL: Pump]]';
    const result = parseModelEmbeds(md);
    expect(result.map(m => m.title)).toEqual(['Motor', 'Pump']);
    for (const m of result) expect(md.slice(m.start, m.end)).toBe(m.raw);
  });
  it('ignores blanks, malformed syntax, code and escaped embeds', () => {
    expect(parseModelEmbeds('![[model: ]] ![[model: broken] \\![[model: Escape]] `![[model: code]]`\n```md\n![[model: fenced]]\n```')).toEqual([]);
  });
});

describe("richer models", () => {
  const base = (over: Record<string, unknown> = {}) => ({ id: "a", name: "ATP synthase", description: "Makes ATP.", group: "g", shape: "cone", size: [0.4, 0.6, 0.4], position: [0, 0, 0], rotation: [0, 0, 0], color: "#60a5fa", explode_direction: [0, 1, 0], assembly_order: 3, ...over });

  it("builds repeated parts in a ring, and marks the copies as one part", () => {
    const s = validateSpec({ parts: [base({ copies: 6, arrange: "ring", arrange_radius: 2 })] });
    expect(s.parts).toHaveLength(6);
    expect(s.parts.filter((p) => !p.instance_of)).toHaveLength(1);
    expect(s.parts.slice(1).every((p) => p.instance_of === "a")).toBe(true);
    const radii = s.parts.map((p) => Math.hypot(p.position[0], p.position[2]));
    radii.forEach((r) => expect(r).toBeCloseTo(2, 5));
  });

  it("lines copies up along x and scatters them inside a range, the same way every time", () => {
    const line = validateSpec({ parts: [base({ copies: 3, arrange: "line", arrange_radius: 1 })] });
    expect(line.parts.map((p) => p.position[0])).toEqual([-1, 0, 1]);
    const a = validateSpec({ parts: [base({ copies: 5, arrange: "scatter", arrange_radius: 1.5 })] });
    const b = validateSpec({ parts: [base({ copies: 5, arrange: "scatter", arrange_radius: 1.5 })] });
    expect(a.parts.map((p) => p.position)).toEqual(b.parts.map((p) => p.position));
    a.parts.forEach((p) => p.position.forEach((v) => expect(Math.abs(v)).toBeLessThanOrEqual(1.5)));
  });

  it("makes each copy fly away from the middle when the model is taken apart", () => {
    const s = validateSpec({ parts: [base({ copies: 4, arrange: "ring", arrange_radius: 2 })] });
    const dirs = s.parts.map((p) => p.explode_direction.join(","));
    expect(new Set(dirs).size).toBe(4);
  });

  it("keeps a shell's see-through setting within range and counts only distinct parts toward the limit", () => {
    expect(validateSpec({ parts: [base({ opacity: 0.2 })] }).parts[0]!.opacity).toBe(0.2);
    expect(validateSpec({ parts: [base({ opacity: 0 })] }).parts[0]!.opacity).toBeCloseTo(0.08);
    expect(validateSpec({ parts: [base({ copies: 12, arrange: "ring" })] }).parts).toHaveLength(12);
  });

  it("scales a model that is far too big or too small to a comfortable size", () => {
    const big = validateSpec({ parts: [base({ position: [40, 0, 0], size: [10, 10, 10] })] });
    fitToView(big.parts);
    expect(Math.max(...big.parts.map((p) => Math.abs(p.position[0]!) + p.size[0]! / 2))).toBeLessThan(6);
    const tiny = validateSpec({ parts: [base({ position: [0.2, 0, 0], size: [0.3, 0.3, 0.3] })] });
    fitToView(tiny.parts);
    expect(Math.abs(tiny.parts[0]!.position[0]!) + tiny.parts[0]!.size[0]! / 2).toBeGreaterThan(2);
  });

  it("keeps a part's source quote only if it really appears in the note", () => {
    const spec = validateSpec({ parts: [base({ source_quote: "makes most of the cell's ATP" }), base({ id: "b", source_quote: "makes oxygen from sunlight" })] });
    verifyPartQuotes(spec, "The mitochondrion makes most of the cell's ATP through respiration.");
    expect(spec.parts[0]!.source_quote).toBeTruthy();
    expect(spec.parts[1]!.source_quote).toBeUndefined();
  });
});

describe("tidyGenerated", () => {
  const mk = (n: number, over: Record<string, unknown> = {}) => ({ id: `p${n}`, name: `Part ${n}`, description: `Does thing ${n}.`, group: "g", shape: "box", size: [1, 1, 1], position: [n, 0, 0], rotation: [0, 0, 0], color: "#60a5fa", explode_direction: [0, 1, 0], assembly_order: n, ...over });

  it("drops a part that was listed twice, along with its copies", () => {
    const spec = validateSpec({ parts: [mk(1), mk(2, { name: "Part 1", description: "Does thing 1.", copies: 3, arrange: "ring" }), mk(3)] });
    const out = tidyGenerated(spec);
    expect(out.parts.map((p) => p.name)).toEqual(["Part 1", "Part 3"]);
  });

  it("keeps the most meaningful parts when there are too many to read at a glance", () => {
    const parts = Array.from({ length: 28 }, (_, i) => mk(i + 1, { size: [1 + i * 0.01, 1, 1] }));
    parts[27] = mk(28, { size: [0.2, 0.2, 0.2], opacity: 0.2 });          // a small shell: kept for being a shell
    parts[26] = mk(27, { size: [0.2, 0.2, 0.2], source_quote: "from the note" }); // small, but backed by the note
    const out = tidyGenerated(validateSpec({ parts }), 20);
    const names = out.parts.map((p) => p.name);
    expect(names).toHaveLength(20);
    expect(names).toContain("Part 28");
    expect(names).toContain("Part 27");
  });

  it("leaves a normal model alone", () => {
    const spec = validateSpec({ parts: [mk(1), mk(2), mk(3)] });
    expect(tidyGenerated(spec).parts).toHaveLength(3);
  });

  it("keeps repeated copies as copies when a saved model is loaded again", () => {
    const first = validateSpec({ parts: [mk(1, { copies: 6, arrange: "ring", arrange_radius: 2 }), mk(2, { name: "Matrix" })] });
    const again = validateSpec(JSON.parse(JSON.stringify(first)));
    expect(again.parts).toHaveLength(7);
    expect(again.parts.filter((p) => !p.instance_of)).toHaveLength(2);
    expect(again.parts.filter((p) => p.instance_of === "p1")).toHaveLength(5);
    expect(again.parts.map((p) => p.position)).toEqual(first.parts.map((p) => p.position));
    expect(validateSpec(again).parts.filter((p) => !p.instance_of)).toHaveLength(2);
  });

  it("does not let copies use up the limit on distinct parts", () => {
    const parts = Array.from({ length: 12 }, (_, i) => mk(i + 1, { copies: 6, arrange: "scatter" }));
    const model = validateSpec({ parts });
    expect(model.parts.filter((p) => !p.instance_of)).toHaveLength(12);
    expect(validateSpec(JSON.parse(JSON.stringify(model))).parts.filter((p) => !p.instance_of)).toHaveLength(12);
  });
});

