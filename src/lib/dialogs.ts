import { useSyncExternalStore } from "react";
/** App-wide create dialogs (slides, audio, 3D) so any Create button can open them, even from a closing sheet. */
export type DialogKey = "slides" | "audio" | "model" | "link" | null;
let current: DialogKey = null;
let file: File | null = null;
const subs = new Set<() => void>();
/** Open a dialog, optionally with a file already chosen (dropped or picked on Home). Closing clears it. */
export function openDialog(k: DialogKey, withFile?: File) { file = k ? withFile ?? null : null; current = k; subs.forEach((f) => f()); }
/** The file the open dialog was started with, if any. */
export const dialogFile = () => file;
export function useOpenDialog() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => null); }
