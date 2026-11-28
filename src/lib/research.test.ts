import { describe, expect, it } from "vitest";
import { cleanWikiText, extractYouTubeUrls, researchIdeas } from "./research";

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

describe("research ideas from a note", () => {
  const note = "# Photosynthesis\n\nPlants turn light into sugar in the **Calvin cycle** and the light reactions. The Calvin cycle needs ATP. Chlorophyll absorbs light. See [[Cellular respiration]] too.\n\nMelvin Calvin won a Nobel Prize for it.";
  it("offers the writer's own headings, bold terms and links, then the words that recur", () => {
    const ideas = researchIdeas(note, "Photosynthesis");
    expect(ideas).toContain("Calvin cycle");
    expect(ideas).toContain("Cellular respiration");
    expect(ideas.some((i) => /light/i.test(i))).toBe(true);
  });
  it("leaves out the title itself, repeats and filler words", () => {
    const ideas = researchIdeas(note, "Photosynthesis");
    expect(ideas.map((i) => i.toLowerCase())).not.toContain("photosynthesis");
    expect(new Set(ideas.map((i) => i.toLowerCase())).size).toBe(ideas.length);
    expect(ideas.some((i) => /^(about|which|would)$/i.test(i))).toBe(false);
  });
  it("gives nothing for an empty note, and respects the limit", () => {
    expect(researchIdeas("", "x")).toEqual([]);
    expect(researchIdeas(note, "", 2)).toHaveLength(2);
  });
});
