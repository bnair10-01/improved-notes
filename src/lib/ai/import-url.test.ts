import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetAppCheckThrottle } = vi.hoisted(() => ({ resetAppCheckThrottle: vi.fn(() => true) }));
vi.mock("../firebase", () => ({ app: {}, USE_EMULATORS: true, getAppCheck: () => null, resetAppCheckThrottle }));

const calls: { params: Record<string, unknown>; input: unknown }[] = [];
let answer = "";
vi.mock("firebase/ai", async (orig) => {
  const real = await orig<typeof import("firebase/ai")>();
  return {
    ...real,
    getAI: () => ({}),
    getGenerativeModel: (_a: unknown, params: Record<string, unknown>) => ({
      generateContent: async (input: unknown) => { calls.push({ params, input }); return { response: { text: () => answer, inferenceSource: "in_cloud" } }; },
    }),
  };
});

import { importFromUrl } from "./tasks";

describe("importFromUrl", () => {
  beforeEach(() => { calls.length = 0; answer = "# Mitochondria\n\nThe powerhouse.\n\n- ATP"; });

  it("reads a website through the URL tool and returns titled notes with the source", async () => {
    const r = await importFromUrl({ url: "https://example.com/bio" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.title).toBe("Mitochondria");
    expect(r.item.kind).toBe("website");
    expect(r.item.markdown).toContain("Source: [example.com](https://example.com/bio)");
    expect((calls[0]!.params["inCloudParams"] as { tools?: unknown }).tools).toEqual([{ urlContext: {} }]);
  });

  it("sends a YouTube link to the model as video", async () => {
    const r = await importFromUrl({ url: "https://www.youtube.com/watch?v=abc" });
    expect(r.ok && r.item.kind).toBe("youtube");
    expect(JSON.stringify(calls[0]!.input)).toContain("fileUri");
  });

  it("rejects things that are not web links", async () => {
    const bad = await importFromUrl({ url: "not a link" });
    expect(bad.ok).toBe(false);
    const file = await importFromUrl({ url: "file:///etc/passwd" });
    expect(file.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("says so when the model can't read the page", async () => {
    answer = "UNREADABLE";
    const r = await importFromUrl({ url: "https://example.com/private" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/couldn't read/i);
  });
});
