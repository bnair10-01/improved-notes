// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("system accessibility preferences", () => {
  const withMedia = (matches: Record<string, boolean>) => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: !!matches[q], media: q }));
  };
  afterEach(() => { vi.unstubAllGlobals(); });

  it("starts from the device's reduce-motion and more-contrast settings when nothing is saved", async () => {
    withMedia({ "(prefers-reduced-motion: reduce)": true, "(prefers-contrast: more)": true });
    const { readA11y } = await import("./a11y");
    expect(readA11y()).toMatchObject({ motion: true, contrast: true });
  });

  it("lets a saved choice win over the device setting", async () => {
    withMedia({ "(prefers-reduced-motion: reduce)": true });
    localStorage.setItem("cleanmap-a11y", JSON.stringify({ motion: false }));
    const { readA11y } = await import("./a11y");
    expect(readA11y().motion).toBe(false);
  });
});
