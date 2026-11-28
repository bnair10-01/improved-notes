import { describe, expect, it } from "vitest";
import { pairKey, relatedPairs } from "./related";

const n = (id: string, title: string, markdown: string) => ({ id, title, markdown });
const NOTES = [
  n("mito", "Mitochondria", "The mitochondrion makes most of the cell's ATP through respiration. Its inner membrane folds into cristae, and a proton gradient drives ATP synthase. Mitochondria have their own circular DNA, which is evidence for endosymbiosis."),
  n("atp", "ATP", "ATP is the energy currency of the cell. Cells spend ATP on movement, building molecules and active transport. Most of it is made in the Mitochondria."),
  n("photo", "Photosynthesis", "Photosynthesis turns light, water and carbon dioxide into sugar and oxygen. Light reactions happen in the thylakoid membrane and make ATP and NADPH. The Calvin cycle in the stroma uses them to fix carbon. Respiration releases the energy that photosynthesis stores."),
  n("chloro", "Chloroplasts", "Chloroplasts are the organelles where photosynthesis happens. They contain stacks of thylakoids and have their own circular DNA."),
  n("lenses", "Four Lenses", "Design strategy balances four lenses. Design asks what people need, business asks what is viable, technology asks what is feasible, and strategy asks where to focus."),
  n("dvs", "Design vs Strategy", "Design asks how should we build it. Strategy asks what should we build, and why."),
  n("feud", "Feudalism", "Feudalism tied lords and vassals together through land and loyalty. Peasants worked the land in return for protection."),
  n("plague", "Black Death", "The Black Death killed about a third of Europe in the 1300s. Labour became scarce, which weakened feudalism."),
];
const key = (r: { a: string; b: string }) => pairKey(r.a, r.b);

describe("relatedPairs", () => {
  const pairs = relatedPairs(NOTES);
  const keys = pairs.map(key);

  it("connects notes that share ideas, across what a person filed them under", () => {
    expect(keys).toContain(pairKey("mito", "chloro"));
    expect(keys).toContain(pairKey("photo", "atp"));
  });

  it("explains each connection with the terms the notes share", () => {
    const r = pairs.find((p) => key(p) === pairKey("mito", "chloro"))!;
    expect(r.shared).toEqual(expect.arrayContaining(["circular", "dna"]));
  });

  it("does not connect unrelated subjects", () => {
    const bio = new Set(["mito", "atp", "photo", "chloro"]);
    const other = new Set(["lenses", "dvs", "feud", "plague"]);
    for (const p of pairs) expect(bio.has(p.a) === bio.has(p.b) || (other.has(p.a) && other.has(p.b))).toBe(true);
  });

  it("leaves out pairs that are already linked", () => {
    const skip = new Set([pairKey("mito", "chloro")]);
    expect(relatedPairs(NOTES, { skip }).map(key)).not.toContain(pairKey("mito", "chloro"));
  });

  it("keeps each note to its strongest few connections", () => {
    const count = new Map<string, number>();
    for (const p of relatedPairs(NOTES, { perNote: 1 })) { count.set(p.a, (count.get(p.a) ?? 0) + 1); count.set(p.b, (count.get(p.b) ?? 0) + 1); }
    expect([...count.values()].every((c) => c <= 1)).toBe(true);
  });

  it("handles too little text", () => {
    expect(relatedPairs([n("a", "A", "x")])).toEqual([]);
    expect(relatedPairs([])).toEqual([]);
  });
});

import { neighborhood, type Vault } from "./vault";
describe("a note's neighbourhood", () => {
  const note = (id: string, title: string, markdown: string) => ({ id, title, markdown, kind: "text", folder_id: null, tags: [], pinned: false, deleted_at: null, updated_at: "", created_at: "", source_note_ids: [] }) as unknown as Vault["notes"][number];
  const vault = {
    notes: [
      note("a", "Cells", "Cells are the basic unit of life. Mitochondria produce energy inside cells."),
      note("b", "Mitochondria", "Mitochondria produce energy for the cell through respiration."),
      note("c", "Chess", "The Sicilian defence is a popular reply to the king pawn opening in chess."),
    ],
    folders: [], links: [],
  } as unknown as Vault;
  it("joins notes that share ideas, even with no written link", () => {
    expect([...neighborhood(vault, "a", 1)].sort()).toEqual(["a", "b"]);
  });
  it("leaves out unrelated notes, and the automatic ones when asked not to", () => {
    expect(neighborhood(vault, "c", 2).size).toBe(1);
    expect([...neighborhood(vault, "a", 1, { auto: false })]).toEqual(["a"]);
  });
  it("follows written links too", () => {
    const linked = { ...vault, links: [{ id: "l", from_note_id: "c", to_note_id: "a", kind: "wikilink", label: null }] } as unknown as Vault;
    expect(neighborhood(linked, "c", 1).has("a")).toBe(true);
  });
});
