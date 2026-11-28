import { getGenerativeModel, ResponseModality } from "firebase/ai";
import { aiConfig, loadAiConfig } from "./config";
import { ai, AiFailure, explain, withAppCheckRetry } from "./run";
import { recordInference } from "./status";

/**
 * A clean reference picture of a concept, drawn by Nano Banana through Firebase AI Logic (cloud only: there is no
 * on-device image model). It guides the 3D model's layout and is kept beside the model as a picture of the whole.
 */
export type ReferenceImage = { mime: string; base64: string };

export const illustrationPrompt = (concept: string, notes?: string) =>
  `Draw one clean educational illustration of: ${concept}.\n`
  + "Style: a simple cutaway or cross-section diagram, flat colours with soft shading, one distinct colour per structure, on a plain white background, seen from a three-quarter angle so depth is clear.\n"
  + "Show only the 6 to 10 most important structures, large and clearly separated, with nothing overlapping and no background scenery. Do not write any text, letters, numbers or labels anywhere in the image.\n"
  + (notes?.trim() ? `Base the structures on these notes, and never contradict them:\n${notes.trim().slice(0, 4000)}` : "Use standard textbook knowledge.");

export async function generateReferenceImage(concept: string, notes?: string): Promise<ReferenceImage> {
  await loadAiConfig();
  const model = getGenerativeModel(ai(), {
    model: aiConfig().image_model,
    generationConfig: { responseModalities: [ResponseModality.TEXT, ResponseModality.IMAGE] },
  });
  try {
    const r = await withAppCheckRetry(() => model.generateContent(illustrationPrompt(concept, notes)));
    const part = r.response.inlineDataParts()?.[0]?.inlineData;
    if (!part?.data) throw new AiFailure("No picture came back.");
    recordInference("in_cloud", "illustrate");
    return { mime: part.mimeType || "image/png", base64: part.data };
  } catch (e) {
    throw explain(e);
  }
}
