import { describe, expect, it } from "vitest";
import { cleanWikiText, extractYouTubeUrls } from "./research";

describe("cleanWikiText", () => {
  it("drops See also, references and everything after", () => {
    const t = "Intro paragraph.\n\n== History ==\nOld days.\n\n=== Early ===\nEarlier.\n\n== See also ==\n* Other\n\n== References ==\n1. x\n\n== Extra ==\nafter";
    expect(cleanWikiText(t)).toBe("Intro paragraph.\n\n== History ==\nOld days.\n\n=== Early ===\nEarlier.");
  });

  it("keeps sections that merely start with a similar word", () => {
    expect(cleanWikiText("A.\n\n== Notes on theory ==\nkept")).toContain("kept");
  });

  it("caps the length", () => {
    expect(cleanWikiText("x".repeat(100), 10)).toHaveLength(10);
  });
});

describe("extractYouTubeUrls", () => {
  it("finds, normalises and de-duplicates watch links", () => {
    const text = "1. https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/abcdefghijk?t=5\nhttps://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ\nhttps://example.com/watch?v=zzzzzzzzzzz";
    expect(extractYouTubeUrls(text)).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=abcdefghijk"]);
  });

  it("respects the limit and returns nothing for plain text", () => {
    expect(extractYouTubeUrls("no links")).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => `https://youtu.be/aaaaaaaaaa${i}`).join(" ");
    expect(extractYouTubeUrls(many, 3)).toHaveLength(3);
  });
});
