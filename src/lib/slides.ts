import { XMLParser } from "fast-xml-parser";

export type Slide = { title: string; bullets: string[]; notes: string; imagePath?: string };
export const MAX_SLIDES = 100;
export const MAX_DECK_BYTES = 50 * 1024 * 1024;
export type DeckMindmapMode = "deck" | "slides";
export function deckMindmapMode(structure: unknown): DeckMindmapMode {
  return structure && typeof structure === "object" && "deck_mode" in structure && structure.deck_mode === "slides" ? "slides" : "deck";
}
// Encode physical newlines and backslashes so editable multiline fields round-trip.
const encode = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n");
const decode = (s: string) => s.replace(/\\(\\|n)/g, (_, c: string) => c === "n" ? "\n" : "\\");
export function slidesToMarkdown(slides: Slide[]): string {
  return slides.slice(0, MAX_SLIDES).map((s, i) => [
    `## Slide ${i + 1}: ${encode(s.title)}`,
    ...s.bullets.map((b) => `- ${encode(b)}`),
    `> Speaker notes: ${encode(s.notes)}`,
    ...(s.imagePath ? [`<!-- slide-image: ${encodeURIComponent(s.imagePath)} -->`] : []),
  ].join("\n")).join("\n\n");
}
export function markdownToSlides(md: string): Slide[] {
  const slides: Slide[] = [];
  let current: Slide | undefined;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^## Slide \d+: ?(.*)$/.exec(line);
    if (heading) {
      if (slides.length >= MAX_SLIDES) break;
      current = { title: decode(heading[1] ?? ""), bullets: [], notes: "" };
      slides.push(current);
    } else if (current) {
      if (line.startsWith("- ")) current.bullets.push(decode(line.slice(2)));
      else if (line.startsWith("> Speaker notes: ")) current.notes = decode(line.slice(17));
      else {
        const image = /^<!-- slide-image: (.*?) -->$/.exec(line);
        if (image?.[1]) { try { current.imagePath = decodeURIComponent(image[1]); } catch { /* ignore malformed metadata */ } }
      }
    }
  }
  return slides;
}

// Namespace prefixes vary between producers; use local names, preserve mixed run order.
type X = { [key: string]: unknown };
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, preserveOrder: true, trimValues: false, parseTagValue: false, processEntities: true, htmlEntities: false });
const array = (x: unknown): X[] => Array.isArray(x) ? x.filter((v): v is X => !!v && typeof v === "object") : [];
function elements(nodes: unknown, name: string): X[] {
  return array(nodes).flatMap((n) => Object.entries(n).filter(([k]) => k !== ":@").flatMap(([k, v]) => [...(k.split(":").pop() === name ? [{ ...n, [name]: v }] : []), ...elements(v, name)]));
}
function text(nodes: unknown): string {
  return array(nodes).map((n) => Object.entries(n).filter(([k]) => k !== ":@").map(([k, v]) => k === "#text" ? String(v) : k === "br" ? "\n" : text(v)).join("")).join("");
}
function attr(n: X, key: string): string {
  const attrs = n[":@"] as X | undefined;
  return String(attrs?.[`@_r:${key}`] ?? attrs?.[`@_${key}`] ?? "");
}
export function resolvePptxPath(source: string, target: string): string {
  if (/^[a-z]+:/i.test(target) || target.includes("\\")) throw new Error("External presentation resource");
  const parts = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") { if (!parts.length) throw new Error("Invalid presentation path"); parts.pop(); }
    else parts.push(p);
  }
  return parts.join("/");
}
export function pptxRelationships(xml: string): { id: string; target: string; type: string }[] {
  return elements(parser.parse(xml), "Relationship").filter((r) => attr(r, "TargetMode") !== "External").map((r) => ({ id: attr(r, "Id"), target: attr(r, "Target"), type: attr(r, "Type") }));
}
export function pptxSlideOrder(presentationXml: string, relsXml: string): string[] {
  const rels = pptxRelationships(relsXml);
  return elements(parser.parse(presentationXml), "sldId").map((s) => {
    const rel = rels.find((r) => r.id === attr(s, "id") && r.type.endsWith("/slide"));
    if (!rel) throw new Error("Missing slide relationship");
    return resolvePptxPath("ppt/presentation.xml", rel.target);
  });
}
export function extractPptxText(xml: string): { title: string; bullets: string[] } {
  const root: unknown = parser.parse(xml);
  const shapes = elements(root, "sp");
  let title = "";
  const paragraphs: { value: string; isTitle: boolean }[] = [];
  for (const shape of shapes) {
    const isTitle = elements(shape["sp"], "ph").some((p) => ["title", "ctrTitle"].includes(attr(p, "type")));
    const lines = elements(shape["sp"], "p").map((p) => text(p["p"]).trim()).filter(Boolean);
    for (const value of lines) paragraphs.push({ value, isTitle });
  }
  // Include table paragraphs when no shapes carry text.
  if (!paragraphs.length) for (const p of elements(root, "p")) { const value = text(p["p"]).trim(); if (value) paragraphs.push({ value, isTitle: false }); }
  const titleIndex = Math.max(0, paragraphs.findIndex((p) => p.isTitle));
  title = paragraphs[titleIndex]?.value ?? "";
  return { title, bullets: paragraphs.filter((_, i) => i !== titleIndex).map((p) => p.value) };
}
export function extractNotesText(xml: string): string {
  const root: unknown = parser.parse(xml);
  return elements(root, "sp").filter((s) => !elements(s["sp"], "ph").some((p) => ["sldNum", "hdr", "ftr", "dt", "sldImg"].includes(attr(p, "type"))))
    .flatMap((s) => elements(s["sp"], "p").map((p) => text(p["p"]).trim())).filter(Boolean).join("\n");
}
export function firstPptxImageId(xml: string): string | undefined {
  return elements(parser.parse(xml), "blip").map((b) => attr(b, "embed")).find(Boolean);
}
export function validateDeckFile(file: { name: string; size: number; type: string }): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "That file is empty or unreadable.";
  if (file.size > MAX_DECK_BYTES) return "Choose a file smaller than 50 MB.";
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext !== "pdf" && ext !== "pptx") return "Choose a PDF or PowerPoint (.pptx) file.";
  const expected = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (file.type && file.type !== expected && file.type !== "application/octet-stream" && !(ext === "pptx" && file.type === "application/zip")) return "The file type doesn't match its extension. Choose a PDF or PPTX.";
  return null;
}
export function validateSlides(raw: unknown, count = 10): Slide[] {
  const limit = Math.min(20, Math.max(5, Math.round(Number.isFinite(count) ? count : 10)));
  if (!Array.isArray(raw)) return [];
  const clean = (x: unknown) => typeof x === "string" && !/\[illegible\]/i.test(x) ? x.trim() : "";
  const result: Slide[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as X, title = clean(s["title"]);
    const bullets = Array.isArray(s["bullets"]) ? s["bullets"].map(clean).filter(Boolean).slice(0, 5) : [];
    if (!title || bullets.length < 3) continue;
    result.push({ title, bullets, notes: clean(s["notes"]) });
    if (result.length === limit) break;
  }
  // Never fabricate missing slides to satisfy the minimum; the caller can request a retry.
  return result;
}
