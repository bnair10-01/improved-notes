import { describe, expect, it } from "vitest";
import { modelConcept } from "./model3d";

describe("modelConcept", () => {
  it("is the note itself unless the person says otherwise", () => {
    expect(modelConcept("Mitochondria")).toBe("Mitochondria");
    expect(modelConcept("Mitochondria", "   ")).toBe("Mitochondria");
  });
  it("lets the person steer it without losing the note", () => {
    expect(modelConcept("Mitochondria", "focus on how ATP is made")).toBe("Mitochondria: focus on how ATP is made");
  });
  it("copes with an untitled note and very long text", () => {
    expect(modelConcept("  ")).toBe("this note");
    expect(modelConcept("A", "x".repeat(2000)).length).toBe(1000);
  });
});
