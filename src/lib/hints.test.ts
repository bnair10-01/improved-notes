import { describe, expect, it } from "vitest";
import { dismissHint, parseHints, shouldShowHint } from "./hints";

describe("tips", () => {
  it("shows every tip by default", () => { expect(shouldShowHint(parseHints(null), "home")).toBe(true); });
  it("a dismissed tip stays hidden", () => { expect(shouldShowHint(dismissHint(parseHints(null), "home"), "home")).toBe(false); });
  it("turning tips off hides all of them", () => { expect(shouldShowHint({ off: true, dismissed: [] }, "study")).toBe(false); });
  it("broken saved data falls back to showing tips", () => { expect(shouldShowHint(parseHints("{bad"), "x")).toBe(true); });
});
