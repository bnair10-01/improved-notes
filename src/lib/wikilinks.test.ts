import { describe, expect, it } from "vitest";
import { linkFirstMention, mentionsTitle, parseWikilinks, renameWikilinks } from "./wikilinks";

describe("wikilinks", () => {
  it("parses unique link targets, ignoring aliases", () => {
    expect(parseWikilinks("See [[Cells]], [[cells|the cell]] and [[Mitosis]]")).toEqual(["cells", "Mitosis"]);
  });
  it("renaming a note rewrites links to it and keeps aliases", () => {
    expect(renameWikilinks("[[Cells]] and [[cells|here]] not [[Cellsx]]", "Cells", "Cell biology"))
      .toBe("[[Cell biology]] and [[Cell biology|here]] not [[Cellsx]]");
  });
  it("finds unlinked mentions but not linked ones", () => {
    expect(mentionsTitle("we studied mitosis today", "Mitosis")).toBe(true);
    expect(mentionsTitle("we studied [[Mitosis]] today", "Mitosis")).toBe(false);
    expect(linkFirstMention("mitosis is fun", "Mitosis")).toBe("[[mitosis]] is fun");
  });
});
