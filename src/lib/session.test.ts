import { describe, expect, it } from "vitest";
import { getSession, resetSession, setSession } from "./session";

describe("scan session", () => {
  it("forgets photos, transcript and storage when reset", () => {
    setSession({ pages: [{ id: "1", dataUrl: "data:image/png;base64,AAAA" }], result: { title: "t", markdown: "m", uncertain_spans: [], structure: { nodes: [], edges: [] } }, noteId: "n" });
    expect(sessionStorage.getItem("cleanmap-session")).toContain("data:image");
    resetSession();
    expect(getSession()).toEqual({ pages: [], result: null, noteId: null });
    expect(sessionStorage.getItem("cleanmap-session")).toBeNull();
  });
});
