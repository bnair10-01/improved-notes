import { describe, expect, it } from "vitest";
import { deckMindmapMode, extractNotesText, extractPptxText, firstPptxImageId, MAX_SLIDES, markdownToSlides, pptxSlideOrder, resolvePptxPath, slidesToMarkdown, validateDeckFile, validateSlides } from "./slides";
const wrap = (s: string) => `<p:sld xmlns:p="p" xmlns:a="a">${s}</p:sld>`;
const p = (s: string) => `<a:p><a:r><a:t>${s}</a:t></a:r></a:p>`;
const shape = (s: string, ph = "") => `<p:sp><p:nvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:txBody>${s}</p:txBody></p:sp>`;
describe("slide markdown", () => {
  it("round-trips text, multiline notes, escapes, and stable image identity", () => {
    const slides = [{ title: "Hello \\n\nworld", bullets: ["A & B", "two\nlines"], notes: "one\ntwo", imagePath: "u/n/1.jpg" }];
    expect(markdownToSlides(slidesToMarkdown(slides))).toEqual(slides);
    expect(slidesToMarkdown([{ title: "Title", bullets: ["Point"], notes: "Say this" }])).toBe("## Slide 1: Title\n- Point\n> Speaker notes: Say this");
  });
  it("ignores sources and malformed image metadata; enforces maximum", () => {
    expect(markdownToSlides("Intro\n## Slide 1: A\n- B\n<!-- slide-image: % -->\n**Sources:** A")).toEqual([{ title: "A", bullets: ["B"], notes: "" }]);
    expect(markdownToSlides(Array.from({ length: 110 }, (_, i) => `## Slide ${i}: X`).join("\n"))).toHaveLength(MAX_SLIDES);
    expect(markdownToSlides("")).toEqual([]);
  });
});
describe("PPTX XML", () => {
  it("orders by relationship id, not ZIP order or numeric slide id", () => {
    const presentation = '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>';
    const rels = '<Relationships><Relationship Id="rId2" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId9" Type="x/slide" Target="/ppt/slides/slide5.xml"/></Relationships>';
    expect(pptxSlideOrder(presentation, rels)).toEqual(["ppt/slides/slide5.xml", "ppt/slides/slide1.xml"]);
    expect(() => pptxSlideOrder(presentation, "<Relationships/>")).toThrow();
  });
  it("groups runs per paragraph and prefers a title placeholder", () => {
    const xml = wrap(shape(p("Bullet &amp; stuff")) + shape('<a:p><a:r><a:t>My </a:t></a:r><a:r><a:t>title</a:t></a:r></a:p>', '<p:ph type="title"/>'));
    expect(extractPptxText(xml)).toEqual({ title: "My title", bullets: ["Bullet & stuff"] });
    expect(extractPptxText(wrap(shape(p("First") + p("Second"))))).toEqual({ title: "First", bullets: ["Second"] });
    expect(extractPptxText("<p:sld/>")).toEqual({ title: "", bullets: [] });
  });
  it("excludes slide numbers from speaker notes", () => {
    expect(extractNotesText(wrap(shape(p("Talk") + p("More"), '<p:ph type="body"/>') + shape(p("1"), '<p:ph type="sldNum"/>')))).toBe("Talk\nMore");
  });
  it("resolves internal paths and rejects escapes and external resources", () => {
    expect(resolvePptxPath("ppt/slides/slide1.xml", "../media/image1.png")).toBe("ppt/media/image1.png");
    expect(() => resolvePptxPath("a.xml", "../secret")).toThrow();
    expect(() => resolvePptxPath("a.xml", "https://example.com/a")).toThrow();
    expect(firstPptxImageId('<a:blip xmlns:a="a" xmlns:r="r" r:embed="rId5"/>')).toBe("rId5");
  });
});
it("validates deck size, extension and MIME", () => {
  expect(validateDeckFile({ name: "a.PDF", size: 50 * 1024 ** 2, type: "application/pdf" })).toBeNull();
  expect(validateDeckFile({ name: "a.pptx", size: 10, type: "" })).toBeNull();
  for (const file of [{ name: "a.doc", size: 10, type: "" }, { name: "a.pdf", size: 0, type: "" }, { name: "a.pdf", size: 50 * 1024 ** 2 + 1, type: "" }, { name: "a.pdf", size: 5, type: "image/png" }]) expect(validateDeckFile(file)).toEqual(expect.any(String));
});
it("validates generated slides without inventing content", () => {
  const valid = { title: "T", bullets: ["1", "2", "3", "4", "5", "6"], notes: "N" };
  expect(validateSlides(Array(30).fill(valid), 99)).toHaveLength(20);
  expect(validateSlides(Array(30).fill(valid), 1)).toHaveLength(5);
  expect(validateSlides([valid])[0]?.bullets).toHaveLength(5);
  expect(validateSlides([null, {}, { ...valid, title: "[illegible]" }, { ...valid, bullets: ["a", "b", "[illegible]"] }])).toEqual([]);
  expect(validateSlides([{ ...valid, notes: "[illegible]" }])[0]?.notes).toBe("");
  expect(validateSlides(null)).toEqual([]);
});
it("defaults mind maps to one deck node and tolerates existing graph structures", () => {
  expect(deckMindmapMode(null)).toBe("deck");
  expect(deckMindmapMode({ nodes: [] })).toBe("deck");
  expect(deckMindmapMode({ deck_mode: "slides" })).toBe("slides");
});
