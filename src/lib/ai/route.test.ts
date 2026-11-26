import { describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ app: {}, USE_EMULATORS: false, getAppCheck: () => null }));

import { InferenceMode } from "firebase/ai";
import { route } from "./route";
import { explain } from "./run";
import { AI_DEFAULTS } from "./config";

describe("hybrid routing", () => {
  it("runs short text tasks on-device first, with cloud fallback", () => {
    for (const t of ["summary", "flashcards", "quiz", "links", "cleanup", "mindmap"] as const) {
      expect(route(t, 800).mode).toBe(InferenceMode.PREFER_ON_DEVICE);
    }
  });

  it("sends long inputs straight to the cloud", () => {
    const r = route("summary", AI_DEFAULTS.on_device_max_chars + 1);
    expect(r.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(r.reason).toMatch(/long input/i);
  });

  it("keeps cloud-only jobs in the cloud however short", () => {
    for (const t of ["audio", "model3d", "slides", "diagrams"] as const) {
      expect(route(t, 10).mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    }
  });

  it("sends photos of handwriting to the cloud, using the stronger model", () => {
    const r = route("transcribe", 4000, { hasImages: true });
    expect(r.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(r.model).toBe(AI_DEFAULTS.cloud_model_pro);
  });

  it("can be forced to the cloud for a retry", () => {
    expect(route("summary", 100, { forceCloud: true }).mode).toBe(InferenceMode.ONLY_IN_CLOUD);
  });

  it("uses the lighter cloud model for plain text work", () => {
    expect(route("summary", 500).model).toBe(AI_DEFAULTS.cloud_model);
  });
});

describe("error messages", () => {
  it("says the credits ran out instead of blaming rate limits", () => {
    const f = explain(new Error("[429 ] Your prepayment credits are depleted. Please go to AI Studio"));
    expect(f.kind).toBe("quota");
    expect(f.message).toMatch(/credits have run out/i);
  });
  it("still explains real rate limits and App Check failures", () => {
    expect(explain(new Error("429 too many requests")).kind).toBe("rate_limit");
    expect(explain(new Error("App Check token invalid")).kind).toBe("app_check");
  });
});
