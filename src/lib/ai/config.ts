import { getRemoteConfig, fetchAndActivate, getValue, type RemoteConfig } from "firebase/remote-config";
import { app, USE_EMULATORS } from "../firebase";

/**
 * Routing knobs, tunable from the Firebase console (Remote Config) without a redeploy.
 * The defaults below are what the app uses until a fetch succeeds, and when offline.
 */
export const AI_DEFAULTS = {
  /** Cloud model used when on-device isn't available or isn't suitable. */
  cloud_model: "gemini-3.8-flash",
  /** Cloud model for heavier jobs: handwriting, diagrams, 3D. */
  cloud_model_pro: "gemini-4-hydrogen",
  /** Nano Banana, the image model that draws the reference picture for a 3D model. */
  image_model: "gemini-3.1-flash-lite-image",
  /** The model that turns notes and the picture into 3D parts. */
  model3d_model: "gemini-4-hydrogen",
  /** Gemini text-to-speech model used by Read aloud. */
  tts_model: "gemini-3.1-flash-tts-preview",
  /** Above this many characters, a task goes straight to the cloud instead of trying on-device. */
  on_device_max_chars: 6000,
  /** Force handwriting transcription to the cloud (best accuracy) instead of on-device first. */
  transcribe_prefer_cloud: false,
  /** Turn on-device inference off entirely (kill switch). */
  on_device_enabled: true,
};
export type AiConfig = typeof AI_DEFAULTS;

let rc: RemoteConfig | null = null;
let ready: Promise<void> | null = null;

function init(): RemoteConfig | null {
  if (rc) return rc;
  if (typeof window === "undefined") return null;
  try {
    rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    rc.defaultConfig = { ...AI_DEFAULTS } as unknown as Record<string, string | number | boolean>;
  } catch { rc = null; }
  return rc;
}

/** Best-effort fetch; never throws and never blocks the app. */
export function loadAiConfig(): Promise<void> {
  if (ready) return ready;
  const c = init();
  ready = !c || USE_EMULATORS ? Promise.resolve() : fetchAndActivate(c).then(() => undefined).catch(() => undefined);
  return ready;
}

export function aiConfig(): AiConfig {
  const c = init();
  if (!c) return { ...AI_DEFAULTS };
  const num = (k: keyof AiConfig, d: number) => { const n = getValue(c, k).asNumber(); return Number.isFinite(n) && n > 0 ? n : d; };
  const str = (k: keyof AiConfig, d: string) => getValue(c, k).asString() || d;
  const bool = (k: keyof AiConfig, d: boolean) => (getValue(c, k).getSource() === "static" ? d : getValue(c, k).asBoolean());
  return {
    cloud_model: str("cloud_model", AI_DEFAULTS.cloud_model),
    cloud_model_pro: str("cloud_model_pro", AI_DEFAULTS.cloud_model_pro),
    image_model: str("image_model", AI_DEFAULTS.image_model),
    model3d_model: str("model3d_model", AI_DEFAULTS.model3d_model),
    tts_model: str("tts_model", AI_DEFAULTS.tts_model),
    on_device_max_chars: num("on_device_max_chars", AI_DEFAULTS.on_device_max_chars),
    transcribe_prefer_cloud: bool("transcribe_prefer_cloud", AI_DEFAULTS.transcribe_prefer_cloud),
    on_device_enabled: bool("on_device_enabled", AI_DEFAULTS.on_device_enabled),
  };
}
