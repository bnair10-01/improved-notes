import { useSyncExternalStore } from "react";

export type InferenceSource = "on_device" | "in_cloud";
export type InferenceStatus = { source: InferenceSource | null; task: string | null; at: number | null };

let status: InferenceStatus = { source: null, task: null, at: null };
const listeners = new Set<() => void>();

/** Record where the last AI call actually ran. This drives the On-device / Cloud badge. */
export function recordInference(source: InferenceSource, task: string) {
  status = { source, task, at: Date.now() };
  listeners.forEach((l) => l());
}

export const getInferenceStatus = () => status;
export function useInferenceStatus(): InferenceStatus {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getInferenceStatus, getInferenceStatus);
}

type LM = { availability?: () => Promise<string> };
/** Does this browser have a local model it could use? ("available" | "downloadable" | "downloading" | "unavailable") */
export async function onDeviceAvailability(): Promise<string> {
  try {
    const lm = (globalThis as unknown as { LanguageModel?: LM }).LanguageModel;
    if (!lm?.availability) return "unavailable";
    return await lm.availability();
  } catch { return "unavailable"; }
}
