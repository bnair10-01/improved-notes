import { describe, expect, it } from "vitest";
import { illustrationPrompt } from "./illustrate";
import { AI_DEFAULTS } from "./config";

describe("reference illustration", () => {
  it("asks for a clean, text-free picture of only the main structures", () => {
    const p = illustrationPrompt("animal cell", "The nucleus holds DNA.");
    expect(p).toMatch(/animal cell/);
    expect(p).toMatch(/do not write any text/i);
    expect(p).toMatch(/nothing overlapping/i);
    expect(p).toMatch(/nucleus holds DNA/);
  });
  it("uses Nano Banana by default, tunable from Remote Config", () => {
    expect(AI_DEFAULTS.image_model).toBe("gemini-nano-banana-2.1");
  });
});
