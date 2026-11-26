import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ app: {}, USE_EMULATORS: true, getAppCheck: () => null }));

const seen: unknown[] = [];
let reply = "";
vi.mock("firebase/ai", async (orig) => {
  const real = await orig<typeof import("firebase/ai")>();
  return {
    ...real,
    getAI: () => ({}),
    getGenerativeModel: () => ({
      generateContent: async (input: unknown) => { seen.push(input); return { response: { text: () => reply, inferenceSource: "in_cloud" } }; },
    }),
  };
});

import { askNotes } from "./tasks";

const sources = [
  { id: "m", kind: "text", title: "Mitochondria", text: "The mitochondrion makes most of the cell's ATP through respiration." },
  { id: "p", kind: "text", title: "Photosynthesis", text: "Light reactions happen in the thylakoid membrane." },
];

describe("askNotes citations", () => {
  beforeEach(() => { seen.length = 0; });

  it("gives the model numbered sources and keeps only quotes that really appear in them", async () => {
    reply = JSON.stringify({
      answer: "Mitochondria make ATP [1].",
      citations: [
        { n: 1, quote: "makes most of the cell's ATP through respiration" },
        { n: 2, quote: "the thylakoid is where oxygen is stored for winter" },
        { n: 7, quote: "light reactions happen in the thylakoid" },
      ],
    });
    const r = await askNotes({ question: "Where is ATP made?", sources });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer.citations).toHaveLength(1);
    expect(r.answer.citations[0]).toMatchObject({ n: 1, title: "Mitochondria", id: "m" });
    const prompt = JSON.stringify(seen[0]);
    expect(prompt).toContain("[1] Mitochondria");
    expect(prompt).toContain("[2] Photosynthesis");
  });

  it("returns an answer with no citations when the model can't back it up", async () => {
    reply = JSON.stringify({ answer: "I don't know.", citations: [] });
    const r = await askNotes({ question: "Who won in 1066?", sources });
    expect(r.ok && r.answer.citations).toEqual([]);
  });

  it("asks for nothing when there are no notes", async () => {
    const r = await askNotes({ question: "Anything?", sources: [{ title: "Empty", text: "  " }] });
    expect(r.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });
});
