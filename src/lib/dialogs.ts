import { useSyncExternalStore } from "react";
/** App-wide create dialogs (slides, audio, 3D) so any Create button can open them, even from a closing sheet. */
export type DialogKey = "slides" | "audio" | "model" | null;
let current: DialogKey = null;
const subs = new Set<() => void>();
export function openDialog(k: DialogKey) { current = k; subs.forEach((f) => f()); }
export function useOpenDialog() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => null); }
