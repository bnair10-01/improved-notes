import { describe, expect, it } from "vitest";
import { defaultNoteTab, homeOrder, QUESTIONS, scoreStyle, STYLES } from "./learning";
describe("learning preferences", () => {
  it("has five questions, each covering every style", () => {
    expect(QUESTIONS).toHaveLength(5);
    for (const question of QUESTIONS) expect(question.options.map((o) => o.style)).toEqual([...STYLES]);
  });
  it("scores winners and breaks ties by fixed order, not answer order", () => {
    expect(scoreStyle(["reading", "reading", "visual"])).toBe("reading");
    expect(scoreStyle(["analytical", "hands_on"])).toBe("hands_on");
    expect(scoreStyle(["auditory", "visual"])).toBe("visual");
    expect(scoreStyle([])).toBe("visual");
    for (const style of STYLES) expect(scoreStyle([style, style])).toBe(style);
  });
  it("returns every home section once and a supported tab", () => {
    for (const style of [...STYLES, null, undefined]) {
      expect(homeOrder(style).sort()).toEqual(["create", "map", "study"]);
      expect(["read", "map", "listen"]).toContain(defaultNoteTab(style));
    }
    expect(defaultNoteTab("visual")).toBe("map");
    expect(defaultNoteTab("auditory")).toBe("listen");
    expect(defaultNoteTab(null)).toBe("read");
    expect(homeOrder(null)).toEqual(["create", "study", "map"]);
  });
});
