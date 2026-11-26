import { InferenceMode } from "firebase/ai";
import { aiConfig } from "./config";

export type AiTask =
  | "transcribe" | "mindmap" | "summary" | "flashcards" | "quiz" | "slides" | "diagrams"
  | "links" | "audio" | "cleanup" | "model3d" | "topic" | "ask";

/** Tasks that must run in the cloud: they need audio, long structured output, or strong vision. */
const CLOUD_ONLY: ReadonlySet<AiTask> = new Set(["audio", "model3d", "slides", "diagrams"]);

export type Route = { mode: InferenceMode; model: string; reason: string };

/**
 * Hybrid routing policy. Short text work runs on-device first (private, free, works offline);
 * long inputs and heavy jobs go to the cloud; everything falls back to the cloud if no local
 * model exists on the device.
 */
export function route(task: AiTask, inputChars: number, opts: { hasImages?: boolean } = {}): Route {
  const cfg = aiConfig();
  const heavy = task === "diagrams" || task === "model3d" || task === "transcribe";
  const model = heavy || opts.hasImages ? cfg.cloud_model_pro : cfg.cloud_model;

  if (!cfg.on_device_enabled) return { mode: InferenceMode.ONLY_IN_CLOUD, model, reason: "On-device turned off" };
  if (CLOUD_ONLY.has(task)) return { mode: InferenceMode.ONLY_IN_CLOUD, model, reason: `${task} needs the cloud model` };
  if (task === "transcribe" && cfg.transcribe_prefer_cloud) return { mode: InferenceMode.ONLY_IN_CLOUD, model, reason: "Cloud preferred for handwriting" };
  if (inputChars > cfg.on_device_max_chars) return { mode: InferenceMode.ONLY_IN_CLOUD, model, reason: "Long input goes to the cloud" };
  return { mode: InferenceMode.PREFER_ON_DEVICE, model, reason: "On-device first, cloud fallback" };
}
