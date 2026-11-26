import { describe, expect, it } from "vitest";
import { UNCERTAIN_RE } from "./remark-uncertain";

describe("uncertain token detection", () => {
  it("flags [illegible] and [word?] but not plain brackets", () => {
    const text = "Meet [illegible] at [noon?] re [ref] budget";
    expect(text.match(UNCERTAIN_RE)).toEqual(["[illegible]", "[noon?]"]);
  });
});
