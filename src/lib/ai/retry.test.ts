import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ app: {}, USE_EMULATORS: true, getAppCheck: () => null }));

const calls: { mode: string; hasConstraint: boolean }[] = [];
let answers: { text: string; src: string }[] = [];

vi.mock("firebase/ai", async (orig) => {
  const real = await orig<typeof import("firebase/ai")>();
  return {
    ...real,
    getAI: () => ({}),
    getGenerativeModel: (_ai: unknown, p: { mode: string; onDeviceParams?: { promptOptions?: { responseConstraint?: unknown } } }) => ({
      generateContent: async () => {
        calls.push({ mode: p.mode, hasConstraint: !!p.onDeviceParams?.promptOptions?.responseConstraint });
        const a = answers.shift()!;
        return { response: { text: () => a.text, inferenceSource: a.src } };
      },
    }),
  };
});

import { runJson } from "./run";

const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] } as const;

describe("runJson on-device handling", () => {
  beforeEach(() => { calls.length = 0; answers = []; });

  it("gives the on-device model the JSON schema as a constraint", async () => {
    answers = [{ text: '{"a":"x"}', src: "on_device" }];
    const r = await runJson({ task: "summary", instructions: "hi", schema: schema as never });
    expect(r.source).toBe("on_device");
    expect(calls[0]!.hasConstraint).toBe(true);
  });

  it("retries in the cloud when the on-device answer is not valid JSON", async () => {
    answers = [{ text: "sure! here is a summary", src: "on_device" }, { text: '{"a":"y"}', src: "in_cloud" }];
    const r = await runJson<{ a: string }>({ task: "summary", instructions: "hi", schema: schema as never });
    expect(r.data.a).toBe("y");
    expect(r.source).toBe("in_cloud");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.mode).toBe("only_in_cloud");
  });

  it("does not retry a cloud answer that is unreadable", async () => {
    answers = [{ text: "nope", src: "in_cloud" }];
    await expect(runJson({ task: "summary", instructions: "hi", schema: schema as never })).rejects.toThrow(/couldn't be read/);
    expect(calls).toHaveLength(1);
  });
});
