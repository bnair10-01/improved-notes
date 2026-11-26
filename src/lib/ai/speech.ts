import { getGenerativeModel, ResponseModality } from "firebase/ai";
import { sentences } from "../a11y";
import { aiConfig, loadAiConfig } from "./config";
import { ai } from "./run";

/** Natural voices from Gemini text-to-speech (through Firebase AI Logic). */
export const GEMINI_VOICES = ["Kore", "Puck", "Charon", "Aoede", "Zephyr"] as const;
export const DEVICE_VOICE = "device";
export type VoiceChoice = (typeof GEMINI_VOICES)[number] | typeof DEVICE_VOICE;

const KEY = "read-aloud-voice";
export function savedVoice(): VoiceChoice {
  try { const v = localStorage.getItem(KEY); if (v === DEVICE_VOICE || (GEMINI_VOICES as readonly string[]).includes(v ?? "")) return v as VoiceChoice; } catch { /* storage unavailable */ }
  return "Kore";
}
export function saveVoice(v: VoiceChoice) { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } }

/** Group sentences into passages a voice can read in one go (about 300 characters). */
export function passages(text: string, max = 320): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of sentences(text)) {
    if (cur && (cur + " " + s).length > max) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** The most natural voice installed on this device (used offline or if the cloud voice fails). */
export function bestDeviceVoice(voices: SpeechSynthesisVoice[], lang = typeof navigator !== "undefined" ? navigator.language : "en-US"): SpeechSynthesisVoice | undefined {
  const base = lang.slice(0, 2).toLowerCase();
  const score = (v: SpeechSynthesisVoice) => {
    let n = 0;
    if (v.lang.toLowerCase().startsWith(base)) n += 50;
    if (v.lang.toLowerCase() === lang.toLowerCase()) n += 10;
    if (/premium|enhanced|natural|neural|siri/i.test(v.name)) n += 40;
    if (/google/i.test(v.name)) n += 25;
    if (/compact|espeak|novelty|bad news|bubbles|whisper|zarvox|trinoids|albert|fred|junior|ralph/i.test(v.name)) n -= 60;
    if (!v.localService) n += 5;
    return n;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

function pcmToBuffer(ctx: AudioContext, base64: string, rate: number): AudioBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const buf = ctx.createBuffer(1, ints.length, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ints.length; i++) ch[i] = ints[i]! / 32768;
  return buf;
}

async function synth(ctx: AudioContext, text: string, voice: string): Promise<AudioBuffer> {
  await loadAiConfig();
  const model = getGenerativeModel(ai(), {
    model: aiConfig().tts_model,
    generationConfig: { responseModalities: [ResponseModality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  });
  const r = await model.generateContent(`Say in a clear, natural, unhurried voice: ${text}`);
  const part = r.response.candidates?.[0]?.content?.parts?.find((p) => "inlineData" in p && p.inlineData);
  const data = part && "inlineData" in part ? part.inlineData : undefined;
  if (!data?.data) throw new Error("no audio returned");
  const rate = Number(/rate=(\d+)/.exec(data.mimeType ?? "")?.[1] ?? 24000);
  return pcmToBuffer(ctx, data.data, rate);
}

export type NarratorEvents = {
  onPassage: (i: number, text: string) => void;
  onLoading: (loading: boolean) => void;
  onEnd: () => void;
  /** The cloud voice couldn't be used; the device voice took over. */
  onFallback: (reason: string) => void;
};

/** Reads a note aloud, fetching the next passage while the current one plays. */
export class Narrator {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private cancelled = false;
  private paused = false;
  private usingDevice = false;

  constructor(private ev: NarratorEvents) {}

  async start(text: string, voice: VoiceChoice) {
    this.cancelled = false; this.paused = false; this.usingDevice = false;
    const parts = passages(text);
    if (!parts.length) { this.ev.onEnd(); return; }
    if (voice === DEVICE_VOICE || (typeof navigator !== "undefined" && !navigator.onLine)) { this.speakDevice(parts, 0); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.resume();
    const ctx = this.ctx;
    const fetchAt = (i: number) => { const p = synth(ctx, parts[i]!, voice); p.catch(() => undefined); return p; };
    this.ev.onLoading(true);
    let next = fetchAt(0);
    for (let i = 0; i < parts.length; i++) {
      let buf: AudioBuffer;
      try { buf = await next; }
      catch (e) {
        if (this.cancelled) return;
        this.ev.onLoading(false);
        this.ev.onFallback(e instanceof Error ? e.message : "the natural voice isn't available");
        this.speakDevice(parts, i);
        return;
      }
      if (this.cancelled) return;
      if (i + 1 < parts.length) next = fetchAt(i + 1);
      this.ev.onLoading(false);
      this.ev.onPassage(i, parts[i]!);
      await new Promise<void>((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.onended = () => resolve();
        this.source = src; src.start();
      });
      if (this.cancelled) return;
    }
    this.finish();
  }

  private speakDevice(parts: string[], from: number) {
    this.usingDevice = true;
    const voice = bestDeviceVoice(speechSynthesis.getVoices());
    const go = (i: number) => {
      if (this.cancelled) return;
      const t = parts[i];
      if (!t) { this.finish(); return; }
      this.ev.onPassage(i, t);
      const u = new SpeechSynthesisUtterance(t);
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = () => go(i + 1);
      speechSynthesis.speak(u);
    };
    go(from);
  }

  private finish() { this.cleanup(); this.ev.onEnd(); }
  private cleanup() { try { this.source?.stop(); } catch { /* already stopped */ } void this.ctx?.close().catch(() => undefined); this.ctx = null; this.source = null; }

  pause() { this.paused = true; if (this.usingDevice) speechSynthesis.pause(); else void this.ctx?.suspend(); }
  resume() { this.paused = false; if (this.usingDevice) speechSynthesis.resume(); else void this.ctx?.resume(); }
  get isPaused() { return this.paused; }
  stop() { this.cancelled = true; if ("speechSynthesis" in window) speechSynthesis.cancel(); this.cleanup(); }
}
