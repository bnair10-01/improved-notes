import { extractNotesText, extractPptxText, firstPptxImageId, MAX_SLIDES, pptxRelationships, pptxSlideOrder, resolvePptxPath, type Slide } from "./slides";
export type ImportedSlide = { slide: Slide; image?: Blob };
const jpeg = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Couldn't render an image.")), "image/jpeg", 0.86));
async function imageToJpeg(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image rendering isn't available.");
    // Canvas export needs an opaque backdrop; use the theme's semantic paper token.
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || "Canvas";
    ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await jpeg(canvas);
  } finally { URL.revokeObjectURL(url); }
}
export async function importDeck(file: File, progress: (done: number, total: number) => void): Promise<{ slides: ImportedSlide[]; warnings: number }> {
  const out: ImportedSlide[] = [];
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_SLIDES) throw new Error(`Please split this PDF into decks of at most ${MAX_SLIDES} slides.`);
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i), base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 1600 / Math.max(base.width, base.height) });
        const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("PDF rendering isn't available.");
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const content = await page.getTextContent();
        const lines: string[] = []; let line = "", lastY: number | undefined;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5] as number;
          if (lastY !== undefined && Math.abs(y - lastY) > 3 && line.trim()) { lines.push(line.trim()); line = ""; }
          line += `${item.str} `; lastY = y;
          if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ""; lastY = undefined; }
        }
        if (line.trim()) lines.push(line.trim());
        out.push({ slide: { title: lines[0] ?? `Slide ${i}`, bullets: lines.slice(1), notes: "" }, image: await jpeg(canvas) });
        canvas.width = 0; canvas.height = 0; page.cleanup(); progress(i, pdf.numPages);
      }
      return { slides: out, warnings: 0 };
    } catch (e) {
      if (e && typeof e === "object" && "name" in e && e.name === "PasswordException") throw new Error("This PDF is password-protected. Export an unlocked copy and try again.");
      throw e;
    } finally { await task.destroy(); }
  }
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  // Read only referenced parts; cap decompression of each XML/image part.
  const read = async (path: string, max = 8 * 1024 * 1024): Promise<Uint8Array> => {
    const entry = zip.file(path); if (!entry) throw new Error("The presentation is missing a required part. Export it to PDF and try again.");
    const data = await entry.async("uint8array");
    if (data.length > max) throw new Error("A presentation resource is too large. Export it to PDF.");
    return data;
  };
  const xml = async (path: string) => new TextDecoder().decode(await read(path));
  const order = pptxSlideOrder(await xml("ppt/presentation.xml"), await xml("ppt/_rels/presentation.xml.rels"));
  if (!order.length || order.length > MAX_SLIDES) throw new Error(`Choose a presentation with 1–${MAX_SLIDES} slides.`);
  let warnings = 0;
  for (const [index, path] of order.entries()) {
    const source = await xml(path), extracted = extractPptxText(source);
    const slide: Slide = { ...extracted, title: extracted.title || `Slide ${index + 1}`, notes: "" };
    const relPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const relationships = zip.file(relPath) ? pptxRelationships(await xml(relPath)) : [];
    const notes = relationships.find((r) => r.type.endsWith("/notesSlide"));
    if (notes) slide.notes = extractNotesText(await xml(resolvePptxPath(path, notes.target)));
    const imageId = firstPptxImageId(source);
    const imageRel = relationships.find((r) => r.id === imageId && r.type.endsWith("/image"));
    let image: Blob | undefined;
    if (imageRel) {
      try {
        const target = resolvePptxPath(path, imageRel.target);
        const ext = target.split(".").pop()?.toLowerCase();
        const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as Record<string, string>)[ext ?? ""];
        if (!mime) throw new Error("Unsupported embedded image");
        const bytes = await read(target, 20 * 1024 * 1024);
        image = await imageToJpeg(new Blob([bytes as BlobPart], { type: mime }));
      } catch { warnings++; }
    }
    out.push({ slide, ...(image ? { image } : {}) }); progress(index + 1, order.length);
  }
  return { slides: out, warnings };
}
