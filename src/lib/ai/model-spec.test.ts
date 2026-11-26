import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetAppCheckThrottle } = vi.hoisted(() => ({ resetAppCheckThrottle: vi.fn(() => true) }));
vi.mock("../firebase", () => ({ app: {}, USE_EMULATORS: true, getAppCheck: () => null, resetAppCheckThrottle }));

let replies: unknown[] = [];
let calls = 0;
const sentConfigs: unknown[] = [];
vi.mock("firebase/ai", async (orig) => {
  const real = await orig<typeof import("firebase/ai")>();
  return {
    ...real,
    getAI: () => ({}),
    getGenerativeModel: (_a: unknown, p: { inCloudParams?: { generationConfig?: unknown } }) => ({
      generateContent: async () => { calls++; sentConfigs.push(p.inCloudParams?.generationConfig); return { response: { text: () => JSON.stringify(replies.shift()), inferenceSource: "in_cloud" } }; },
    }),
  };
});

import { generateModelSpec } from "./tasks";

const part = (i: number) => ({ id: `p${i}`, name: `Part ${i}`, description: "A part.", group: "g", shape: "box", size: [1, 1, 1], position: [i, 0, 0], rotation: [0, 0, 0], color: "#60a5fa", explode_direction: [0, 1, 0], assembly_order: i });
const spec = (n: number) => ({ title: "Mitochondrion", summary: "A model.", parts: Array.from({ length: n }, (_, i) => part(i + 1)) });

describe("generateModelSpec", () => {
  beforeEach(() => { replies = []; calls = 0; sentConfigs.length = 0; });

  it("accepts a rich model on the first try", async () => {
    replies = [spec(9)];
    const r = await generateModelSpec({ concept: "A mitochondrion" });
    expect(r.ok && r.spec.parts.length).toBe(9);
    expect(calls).toBe(1);
  });

  it("asks again once when the first model is too simple", async () => {
    replies = [spec(1), spec(8)];
    const r = await generateModelSpec({ concept: "A mitochondrion" });
    expect(r.ok && r.spec.parts.length).toBe(8);
    expect(calls).toBe(2);
  });

  it("says so when it stays too simple", async () => {
    replies = [spec(1), spec(2)];
    const r = await generateModelSpec({ concept: "A mitochondrion" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too simple/i);
  });

  it("does not let the model 'think' first, which made it return a single part", async () => {
    replies = [spec(9)];
    await generateModelSpec({ concept: "A mitochondrion" });
    expect(JSON.stringify(sentConfigs[0])).toContain('"thinkingBudget":0');
  });
});
