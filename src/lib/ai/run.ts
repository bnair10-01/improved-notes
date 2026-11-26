import { AIError, getAI, getGenerativeModel, GoogleAIBackend, type Part } from "firebase/ai";
import { app, getAppCheck, USE_EMULATORS } from "../firebase";
import { loadAiConfig } from "./config";
import { route, type AiTask } from "./route";
import { toSchema, type JS } from "./schema";
import { recordInference, type InferenceSource } from "./status";

/**
 * Every AI call in the app goes through here, on Firebase AI Logic's hybrid inference:
 * the SDK runs the prompt on-device (Gemini Nano in Chrome / Android, Apple Foundation
 * Models on iOS) when a local model is available, and falls back to the cloud when not.
 */
let aiInstance: ReturnType<typeof getAI> | null = null;
const ai = () => (aiInstance ??= getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true }));

export type RunOptions = {
  task: AiTask;
  /** What to do. Placed at the head of the prompt so it applies on-device and in the cloud. */
  instructions: string;
  parts?: Part[];
  /** JSON shape of the answer. Omit for plain text. */
  schema?: JS;
  /** Size of the input in characters, used to decide on-device vs cloud. */
  chars?: number;
  hasImages?: boolean;
};

export class AiFailure extends Error {
  constructor(message: string, readonly kind: "rate_limit" | "quota" | "app_check" | "offline" | "other" = "other") {
    super(message);
  }
}

export function explain(err: unknown): AiFailure {
  if (err instanceof AiFailure) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err instanceof AIError ? (err.customErrorData as { status?: number } | undefined)?.status : undefined) ?? 0;
  if (/prepayment|credits? (are|is) depleted|billing/i.test(msg))
    return new AiFailure("This project's AI credits have run out. Add credits or billing in Google AI Studio, then try again.", "quota");
  if (status === 429 || /resource.?exhausted|rate.?limit|too many/i.test(msg))
    return new AiFailure("Too many requests right now. Please wait a moment and try again.", "rate_limit");
  if (/app.?check/i.test(msg))
    return new AiFailure("This device couldn't be verified (App Check). Reload the page and try again.", "app_check");
  if (status === 403 || /quota|billing/i.test(msg))
    return new AiFailure("The AI quota for this project has been used up. Try again later.", "quota");
  if (/network|fetch|offline|failed to fetch/i.test(msg) || (typeof navigator !== "undefined" && !navigator.onLine))
    return new AiFailure("You're offline and no on-device model is available for this task. Reconnect and try again.", "offline");
  return new AiFailure("The AI couldn't finish that. Please try again.", "other");
}

const stripFences = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

let warnedAppCheck = false;
/** Firebase AI Logic needs App Check. Say so loudly instead of failing with an opaque 403. */
function checkAppCheck() {
  if (USE_EMULATORS || getAppCheck() || warnedAppCheck) return;
  warnedAppCheck = true;
  console.warn("Firebase App Check is not initialised. Set VITE_APPCHECK_SITE_KEY (or VITE_APPCHECK_DEBUG_TOKEN for local/judging use); AI Logic will reject unverified requests.");
}

export async function runModel(opts: RunOptions & { forceCloud?: boolean }): Promise<{ text: string; source: InferenceSource }> {
  checkAppCheck();
  await loadAiConfig();
  const chars = opts.chars ?? opts.instructions.length;
  const r = route(opts.task, chars, { hasImages: !!opts.hasImages, forceCloud: !!opts.forceCloud });
  const model = getGenerativeModel(ai(), {
    mode: r.mode,
    // Tell the on-device model the JSON shape too, otherwise it answers in free text.
    ...(opts.schema ? { onDeviceParams: { promptOptions: { responseConstraint: opts.schema } } } : {}),
    inCloudParams: {
      model: r.model,
      ...(opts.schema ? { generationConfig: { responseMimeType: "application/json", responseSchema: toSchema(opts.schema) } } : {}),
    },
  });
  try {
    const result = await model.generateContent([{ text: opts.instructions }, ...(opts.parts ?? [])]);
    const source: InferenceSource = result.response.inferenceSource === "on_device" ? "on_device" : "in_cloud";
    recordInference(source, opts.task);
    return { text: result.response.text(), source };
  } catch (e) {
    throw explain(e);
  }
}

/** Run a prompt and parse the JSON answer. */
export async function runJson<T = unknown>(opts: RunOptions & { schema: JS }): Promise<{ data: T; source: InferenceSource }> {
  const parse = (text: string): T | undefined => {
    try { return JSON.parse(stripFences(text)) as T; } catch { return undefined; }
  };
  const first = await runModel(opts);
  const data = parse(first.text);
  if (data !== undefined) return { data, source: first.source };
  // A small on-device model sometimes returns text that isn't valid JSON. Retry once in the cloud.
  if (first.source === "on_device") {
    const retry = await runModel({ ...opts, forceCloud: true });
    const again = parse(retry.text);
    if (again !== undefined) return { data: again, source: retry.source };
  }
  throw new AiFailure("The AI returned something that couldn't be read. Please try again.");
}

/** Turn a data: URL into an inline image part. */
export function imagePart(dataUrl: string): Part {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new AiFailure("That image couldn't be read.");
  return { inlineData: { mimeType: m[1]!, data: m[2]! } };
}

/** Wrap a task so callers always get { ok, ... } and never an exception. */
export async function safe<T extends object>(label: string, fn: () => Promise<T>): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    const f = explain(e);
    if (f.kind === "other") console.error(`${label} failed`, e);
    return { ok: false, error: f.message };
  }
}
