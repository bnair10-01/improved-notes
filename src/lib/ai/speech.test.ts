import { describe, expect, it, vi } from "vitest";

const { resetAppCheckThrottle } = vi.hoisted(() => ({ resetAppCheckThrottle: vi.fn(() => true) }));
vi.mock("../firebase", () => ({ app: {}, USE_EMULATORS: true, getAppCheck: () => null, resetAppCheckThrottle }));

import { bestDeviceVoice, passages } from "./speech";

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe("passages", () => {
  it("groups sentences into passages under the limit and keeps every word", () => {
    const text = "One is here. Two is here too. Three follows next. Four is the last one.";
    const p = passages(text, 30);
    expect(p.every((x) => x.length <= 45)).toBe(true);
    expect(p.join(" ")).toBe(text);
  });
  it("returns nothing for empty text", () => {
    expect(passages("   ")).toEqual([]);
  });
});

describe("bestDeviceVoice", () => {
  it("prefers an enhanced voice in the right language over the default robotic ones", () => {
    const best = bestDeviceVoice([v("Fred", "en-US"), v("Samantha (Enhanced)", "en-US"), v("Daniel", "en-GB"), v("Thomas", "fr-FR")], "en-US");
    expect(best?.name).toBe("Samantha (Enhanced)");
  });
  it("avoids novelty voices and matches the language first", () => {
    expect(bestDeviceVoice([v("Zarvox", "en-US"), v("Amelie", "fr-FR")], "fr-FR")?.name).toBe("Amelie");
    expect(bestDeviceVoice([v("Zarvox", "en-US"), v("Alex", "en-US")], "en-US")?.name).toBe("Alex");
  });
});
