import { describe, expect, it } from 'vitest';
import { validateSpec, centroidDirection, explodeOffset, partsToNodes, findPath, parseModelEmbeds } from './model3d';
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
