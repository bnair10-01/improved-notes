import { describe, expect, it } from "vitest";
import { classifyRemote, conflictCopyTitle } from "./conflict";

const base = { baseRev: 3, editorId: "me", dirty: false };

describe("classifyRemote", () => {
  it("ignores snapshots that carry nothing new", () => {
    expect(classifyRemote({ ...base, remoteRev: 3, remoteEditor: "other" })).toBe("none");
    expect(classifyRemote({ ...base, remoteRev: 2, remoteEditor: "other" })).toBe("none");
  });
  it("recognises our own save coming back, even while typing", () => {
    expect(classifyRemote({ ...base, remoteRev: 4, remoteEditor: "me" })).toBe("own");
    expect(classifyRemote({ ...base, dirty: true, remoteRev: 4, remoteEditor: "me" })).toBe("own");
  });
  it("takes another device's change silently when there is nothing unsaved", () => {
    expect(classifyRemote({ ...base, remoteRev: 4, remoteEditor: "other" })).toBe("apply");
  });
  it("asks the person when another device changed the note while they have unsaved edits", () => {
    expect(classifyRemote({ ...base, dirty: true, remoteRev: 4, remoteEditor: "other" })).toBe("conflict");
  });
  it("treats a change with no editor tag (older data) as someone else's", () => {
    expect(classifyRemote({ ...base, remoteRev: 5, remoteEditor: undefined })).toBe("apply");
    expect(classifyRemote({ ...base, dirty: true, remoteRev: 5, remoteEditor: null })).toBe("conflict");
  });
});

describe("conflictCopyTitle", () => {
  it("labels the copy so it can be found and merged by hand", () => {
    expect(conflictCopyTitle("Cells", new Date("2026-11-26T10:30:00Z"))).toBe("Cells (conflict copy 2026-11-26 10:30)");
    expect(conflictCopyTitle("", new Date("2026-11-26T10:30:00Z"))).toContain("Untitled");
  });
});
