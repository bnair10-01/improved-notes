import { describe, expect, it } from "vitest";
import { citedNumbers, citedSources, numberSources, passagesOf, verifyCitations } from "./cite";

const list = numberSources([
  { id: "a", title: "Mitochondria", text: "The mitochondrion makes most of the cell's ATP through **respiration**." },
  { id: "b", title: "Photosynthesis", text: "Light reactions happen in the thylakoid membrane." },
]).list;

describe("numberSources", () => {
  it("numbers sources from 1 and cuts long ones to their share", () => {
    const { list: l, context } = numberSources([{ title: "A", text: "x".repeat(9000) }, { title: "B", text: "y" }], 2000);
    expect(l.map((s) => s.n)).toEqual([1, 2]);
    expect(l[0]!.text.length).toBe(1000);
    expect(context).toContain("[2] B");
  });
});

describe("verifyCitations", () => {
  it("keeps a quote that really appears in the source, ignoring markdown and case", () => {
    const v = verifyCitations([{ n: 1, quote: "makes most of the cell's ATP through respiration" }], list);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ n: 1, title: "Mitochondria", id: "a" });
  });
  it("drops invented quotes, unknown sources and very short quotes", () => {
    const v = verifyCitations([
      { n: 1, quote: "mitochondria make oxygen from sunlight" },
      { n: 9, quote: "light reactions happen in the thylakoid" },
      { n: 2, quote: "light" },
      { n: 2, quote: "Light reactions happen in the thylakoid membrane" },
    ], list);
    expect(v.map((c) => c.n)).toEqual([2]);
  });
  it("copes with garbage", () => {
    expect(verifyCitations(undefined, list)).toEqual([]);
    expect(verifyCitations([null, 5, "x"], list)).toEqual([]);
  });
});

describe("citedNumbers and citedSources", () => {
  it("reads [1] and [1, 3] markers in order, once each", () => {
    expect(citedNumbers("A [2]. B [1, 3]. C [2].")).toEqual([2, 1, 3]);
  });
  it("lists only sources that exist", () => {
    expect(citedSources("x [2] y [7]", list).map((s) => s.title)).toEqual(["Photosynthesis"]);
  });
});

describe("passagesOf", () => {
  it("splits a note into numbered passages and caps them", () => {
    const p = passagesOf("One.\n\nTwo.\n\n" + "z".repeat(900), "Note", "id1");
    expect(p.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(p[0]).toMatchObject({ title: "Note", id: "id1", text: "One." });
    expect(passagesOf(Array.from({ length: 60 }, (_, i) => `p${i}`).join("\n\n"), "N")).toHaveLength(24);
  });
});
