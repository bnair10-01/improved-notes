import { planChunks } from "./audio";
// Called only from browser event handlers, never during SSR.
export async function readAudioDuration(file: Blob): Promise<number> {
  const context = new AudioContext();
  try { return (await context.decodeAudioData(await file.arrayBuffer())).duration; }
  finally { await context.close(); }
}
export function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read audio."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}
export async function* wavChunks(blob: Blob): AsyncGenerator<{ base64: string; mime: string; offsetSec: number; index: number; total: number }> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    // Actual output is mono PCM16, not the compressed input byte rate.
    const plans = planChunks(audio.duration, audio.length * 2, { maxBytes: 16 * 1024 * 1024 - 44, maxSec: 300 });
    for (let index = 0; index < plans.length; index++) {
      const plan = plans[index]!;
      const first = Math.floor(plan.start * audio.sampleRate);
      const last = index === plans.length - 1 ? audio.length : Math.floor(plan.end * audio.sampleRate);
      const length = last - first;
      const buffer = new ArrayBuffer(44 + length * 2);
      const view = new DataView(buffer);
      const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      write(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, length * 2, true);
      const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      for (let i = 0; i < length; i++) {
        let value = 0;
        for (const channel of channels) value += channel[first + i] ?? 0;
        value = Math.max(-1, Math.min(1, value / channels.length));
        view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
      }
      yield { base64: await blobBase64(new Blob([buffer], { type: "audio/wav" })), mime: "audio/wav", offsetSec: first / audio.sampleRate, index, total: plans.length };
    }
  } finally { await context.close(); }
}
