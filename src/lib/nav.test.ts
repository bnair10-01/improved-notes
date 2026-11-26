import { describe, expect, it } from "vitest";
import { NAV, isActive, sectionName } from "./nav";

const by = (to: string) => NAV.find((n) => n.to === to)!;

describe("nav", () => {
  it("keeps Home exact and sections prefix-matched", () => {
    expect(isActive(by("/"), "/")).toBe(true);
    expect(isActive(by("/"), "/vault")).toBe(false);
    expect(isActive(by("/topics"), "/topics/abc/map")).toBe(true);
    expect(isActive(by("/study"), "/studying")).toBe(false);
  });
  it("highlights only Graph, not Notes, on the graph page", () => {
    expect(isActive(by("/vault"), "/vault/graph")).toBe(false);
    expect(isActive(by("/vault/graph"), "/vault/graph")).toBe(true);
    expect(isActive(by("/vault"), "/vault/xyz")).toBe(true);
  });
  it("names the page for the top bar", () => {
    expect(sectionName("/vault/abc")).toBe("Notes");
    expect(sectionName("/capture")).toBe("Capture");
    expect(sectionName("/settings")).toBe("Settings");
  });
});
