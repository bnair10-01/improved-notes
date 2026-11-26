import { describe, expect, it } from "vitest";
import { parseSections, planSplit } from "./split";

describe("parseSections", () => {
  it("reads a title, an overview and the sections", () => {
    const r = parseSections("# Black holes\n\nRegions where gravity is so strong that nothing escapes.\n\n## Formation\nStars collapse.\n\n## Event horizon\nThe point of no return.\n");
    expect(r.title).toBe("Black holes");
    expect(r.overview).toBe("Regions where gravity is so strong that nothing escapes.");
    expect(r.sections.map((s) => s.title)).toEqual(["Formation", "Event horizon"]);
    expect(r.sections[1]!.markdown).toBe("The point of no return.");
  });

  it("drops empty sections", () => {
    expect(parseSections("# T\n\n## A\n\n## B\ntext").sections.map((s) => s.title)).toEqual(["B"]);
  });

  it("still makes several parts out of a flat answer with no headings", () => {
    const flat = ["Intro paragraph about the whole thing.", "First idea is explained here at length.", "Second idea comes after it.", "Third idea follows.", "Fourth idea wraps up."].join("\n\n");
    const r = parseSections(flat);
    expect(r.overview).toBe("Intro paragraph about the whole thing.");
    expect(r.sections.length).toBeGreaterThanOrEqual(2);
    expect(r.sections.length).toBeLessThanOrEqual(4);
  });

  it("keeps a very short answer as one note instead of inventing sections", () => {
    expect(parseSections("Just one line.").sections).toHaveLength(1);
    expect(parseSections("").sections).toEqual([]);
  });
});

describe("planSplit", () => {
  const sections = [{ title: "Formation", markdown: "Stars collapse." }, { title: "Event horizon", markdown: "No return." }];

  it("makes an overview that links to every part, and parts that link back", () => {
    const plan = planSplit({ topic: "Black holes", overview: "What they are.", sections, source: "https://example.com/bh" });
    expect(plan).toHaveLength(3);
    expect(plan[0]!.title).toBe("Black holes: overview");
    expect(plan[0]!.markdown).toContain("[[Formation]]");
    expect(plan[0]!.markdown).toContain("[[Event horizon]]");
    expect(plan[1]!.markdown).toContain("Part of [[Black holes: overview]]");
    expect(plan[1]!.markdown).toContain("Source: https://example.com/bh");
  });

  it("never reuses a title that already exists, so links point to the right note", () => {
    const plan = planSplit({ topic: "Black holes", overview: "", sections, existingTitles: ["formation", "Black holes: overview"] });
    expect(plan[0]!.title).toBe("Black holes: overview (2)");
    expect(plan[1]!.title).toBe("Formation (2)");
    expect(plan[1]!.markdown).toContain("[[Black holes: overview (2)]]");
  });
});
