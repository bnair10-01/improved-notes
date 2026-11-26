import { describe, expect, it } from "vitest";
import { a11yAttrs, parseA11y, sentences } from "./a11y";

describe("accessibility settings", () => {
  it("falls back to defaults for missing or broken saved settings", () => {
    expect(parseA11y(null).size).toBe(100);
    expect(parseA11y("not json").font).toBe("default");
  });
  it("rejects text sizes outside the offered steps", () => {
    expect(parseA11y('{"size":300}').size).toBe(100);
    expect(parseA11y('{"size":125}').size).toBe(125);
  });
  it("high contrast, reduce motion and focus mode map to html attributes", () => {
    const at = a11yAttrs(parseA11y('{"contrast":true,"motion":true,"focus":true,"spacing":"loose"}'));
    expect(at["data-contrast"]).toBe("high");
    expect(at["data-motion"]).toBe("reduce");
    expect(at["data-focus"]).toBe("on");
    expect(at.style["--lh"]).toBe("1.36");
  });
  it("read-aloud splits text into sentences and drops markdown symbols", () => {
    expect(sentences("# Title. Plants grow! Do they?")).toEqual(["Title.", "Plants grow!", "Do they?"]);
  });
});
