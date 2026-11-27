import { describe, expect, it } from "vitest";
import { buildExportEntries, sanitizeFilename } from "./export";
const note = (id: string, title: string, folder_id: string | null = null) => ({ id, title, folder_id, markdown: `# ${id}` });
describe("Markdown export paths", () => {
  it("sanitizes unsafe, traversal, empty and reserved names", () => {
    for (const raw of ["../a\\b:c?", "...", "CON", "nul.txt", "\u0000", ""]) {
      const name = sanitizeFilename(raw);
      // eslint-disable-next-line no-control-regex
      expect(name).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/);
      expect(name).not.toMatch(/^[. ]|[. ]$/);
      expect(name.length).toBeGreaterThan(0);
    }
    expect(sanitizeFilename("a".repeat(1000)).length).toBeLessThanOrEqual(90);
  });
  it("keeps nested folders and file contents", () => {
    expect(buildExportEntries([note("1", "Lesson", "child")], [
      { id: "root", name: "Course", parent_id: null },
      { id: "child", name: "Week", parent_id: "root" },
    ])).toEqual([{ path: "Course/Week/Lesson.md", markdown: "# 1" }]);
  });
  it("avoids case-insensitive collisions for files and folders", () => {
    const entries = buildExportEntries([note("1", "A"), note("2", "a"), note("3", "a (2)")], [{ id: "f", name: "A.md", parent_id: null }]);
    expect(new Set(entries.map((e) => e.path.toLowerCase())).size).toBe(3);
    expect(entries.some((e) => e.path === "A.md")).toBe(false);
  });
  it("handles missing parents, cycles, and trash without escaping the archive", () => {
    const entries = buildExportEntries([note("1", "../x", "a"), note("2", "Y", "missing"), { ...note("3", "Trash"), deleted_at: "2026-01-01" }], [
      { id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => !e.path.split("/").includes("..") && !e.path.startsWith("/"))).toBe(true);
  });
});
