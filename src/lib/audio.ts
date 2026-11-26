export type Segment = { start: number; end: number; speaker?: string; text: string };
export type Bookmark = { t: number; comment: string };
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_SEC = 90 * 60;
export function formatTime(sec: number): string {
  const n = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const s = String(n % 60).padStart(2, "0");
  return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${s}` : `${Math.floor(n / 60)}:${s}`;
}
export function parseTime(value: string): number {
  if (!/^\d+:\d{2}(?::\d{2})?$/.test(value)) return NaN;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some(n => n >= 60)) return NaN;
  return parts.reduce((n, p) => n * 60 + p, 0);
}
export function planChunks(durationSec: number, bytes: number, limits: { maxBytes: number; maxSec: number }): { start: number; end: number }[] {
  if (![durationSec, bytes, limits.maxBytes, limits.maxSec].every(Number.isFinite) || durationSec < 0 || bytes < 0 || limits.maxBytes <= 0 || limits.maxSec <= 0) throw new Error("Invalid chunk limits.");
  if (!durationSec) return [];
  const count = Math.max(1, Math.ceil(bytes / limits.maxBytes), Math.ceil(durationSec / limits.maxSec));
  if (count > 10000) throw new Error("Too many chunks.");
  return Array.from({ length: count }, (_, i) => ({ start: durationSec * i / count, end: durationSec * (i + 1) / count }));
}
// Markdown carries starts only. Inferred ends are the next start, or infinity.
export function segmentsToMarkdown(segs: Segment[]): string {
  return segs.map(s => `**[${formatTime(s.start)}]${s.speaker ? ` ${s.speaker.replace(/[\n\r*]/g, " ")}` : ""}:** ${s.text.replace(/\r?\n/g, " ")}`).join("\n");
}
export function markdownToSegments(md: string): Segment[] {
  const result: Segment[] = [];
  for (const line of md.split("\n")) {
    const match = /^\*\*\[(\d+:\d{2}(?::\d{2})?)\](?: (.*?))?:\*\* ?(.*)$/.exec(line);
    if (!match) continue;
    const start = parseTime(match[1]!);
    if (!Number.isFinite(start)) continue;
    result.push({ start, end: Infinity, ...(match[2] ? { speaker: match[2] } : {}), text: match[3]! });
  }
  return result.map((s, i) => ({ ...s, end: result[i + 1]?.start ?? Infinity }));
}
export function activeSegment(segs: Segment[], t: number): number {
  return segs.findIndex(s => t >= s.start && t < s.end);
}
export function validateAudioFile(file: { name: string; size: number; type: string }, durationSec?: number): string | null {
  if (!/\.(mp3|m4a|wav|webm|ogg)$/i.test(file.name)) return "Choose an MP3, M4A, WAV, WebM, or OGG file.";
  if (file.type && !/^(audio\/(mpeg|mp3|mp4|m4a|x-m4a|wav|wave|x-wav|webm|ogg|x-ogg)|video\/(mp4|webm)|application\/ogg)(;.*)?$/i.test(file.type)) return "This file does not appear to be supported audio.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "This audio file is empty.";
  if (file.size > MAX_AUDIO_BYTES) return "Audio must be 100 MB or smaller.";
  if (durationSec !== undefined && (!Number.isFinite(durationSec) || durationSec <= 0)) return "Couldn't read the audio duration. Try another file.";
  if (durationSec !== undefined && durationSec > MAX_AUDIO_SEC) return "Audio must be 90 minutes or shorter.";
  return null;
}
