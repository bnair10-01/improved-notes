import { describe, expect, it } from "vitest";
import { distance, forceLayout3d } from "./graph-layout";

describe("forceLayout3d", () => {
  const ids = ["a", "b", "c", "x", "y", "z"];
  const edges: [string, string][] = [["a", "b"], ["b", "c"], ["x", "y"], ["y", "z"]];
  const pos = forceLayout3d(ids, edges);

  it("places every node at a finite 3D position", () => {
    expect(pos.size).toBe(6);
    for (const p of pos.values()) expect(p.every(Number.isFinite)).toBe(true);
  });

  it("is deterministic", () => {
    const again = forceLayout3d(ids, edges);
    for (const id of ids) expect(again.get(id)).toEqual(pos.get(id));
  });

  it("pulls linked notes together and pushes separate groups apart", () => {
    const linked = (distance(pos.get("a")!, pos.get("b")!) + distance(pos.get("x")!, pos.get("y")!)) / 2;
    const apart = (distance(pos.get("a")!, pos.get("x")!) + distance(pos.get("c")!, pos.get("z")!)) / 2;
    expect(linked).toBeLessThan(apart);
  });

  it("copes with no nodes, one node, and edges to nodes that aren't shown", () => {
    expect(forceLayout3d([], []).size).toBe(0);
    expect(forceLayout3d(["solo"], []).get("solo")).toEqual([0, 0, 0]);
    expect(forceLayout3d(["a", "b"], [["a", "ghost"]]).size).toBe(2);
  });

  it("keeps separate groups close enough to see together, without notes sitting on top of each other", () => {
    const names = ["mito", "atp", "photo", "chloro", "lenses", "dvs", "feud", "plague", "model", "web", "cards"];
    const links: [string, string][] = [["atp", "mito"], ["photo", "mito"], ["chloro", "photo"], ["lenses", "dvs"], ["plague", "feud"], ["mito", "chloro"], ["photo", "atp"], ["model", "mito"]];
    const p = forceLayout3d(names, links);
    const maxR = Math.max(...[...p.values()].map((v) => Math.hypot(...v)));
    let minD = Infinity;
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) minD = Math.min(minD, distance(p.get(names[i]!)!, p.get(names[j]!)!));
    expect(maxR).toBeLessThan(20);
    expect(minD).toBeGreaterThan(3);
  });
});
