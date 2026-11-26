import { describe, expect, it } from "vitest";
import { activeSegment, formatTime, markdownToSegments, parseTime, planChunks, segmentsToMarkdown, validateAudioFile } from "./audio";
describe("audio", () => {
  it("formats time safely", () => { expect([0, 12, 62, 3723, -2, NaN].map(formatTime)).toEqual(["0:00", "0:12", "1:02", "1:02:03", "0:00", "0:00"]); });
  it("parses timestamps and rejects malformed values", () => { expect(parseTime("1:02:03")).toBe(3723); expect(parseTime("12:01")).toBe(721); for (const s of ["a", "1:60", "1:99:00", "-1:02", "1:2"]) expect(parseTime(s)).toBeNaN(); });
  it("plans contiguous bounded chunks", () => {
    const chunks = planChunks(100, 1000, { maxBytes: 300, maxSec: 30 });
    expect(chunks).toEqual([{ start: 0, end: 25 }, { start: 25, end: 50 }, { start: 50, end: 75 }, { start: 75, end: 100 }]);
    expect(planChunks(0, 0, { maxBytes: 1, maxSec: 1 })).toEqual([]);
    expect(() => planChunks(3, 3, { maxBytes: 0, maxSec: 1 })).toThrow();
    expect(planChunks(10, 20, { maxBytes: 20, maxSec: 10 })).toEqual([{ start: 0, end: 10 }]);
  });
  it("round trips timestamped text with inferred ends", () => {
    const segs = [{ start: 12, end: 20, speaker: "Speaker 1", text: "Hello [word?]" }, { start: 20, end: 25, text: "[illegible]" }];
    const md = segmentsToMarkdown(segs);
    expect(md).toBe("**[0:12] Speaker 1:** Hello [word?]\n**[0:20]:** [illegible]");
    expect(markdownToSegments(md)).toEqual([{ ...segs[0], end: 20 }, { ...segs[1], end: Infinity }]);
    expect(markdownToSegments("plain text\n**[1:99]:** bad")).toEqual([]);
  });
  it("finds active segments with exclusive ends and gaps", () => {
    const segs = [{ start: 1, end: 2, text: "a" }, { start: 3, end: 5, text: "b" }];
    expect([0, 1, 2, 3, 5, NaN].map(t => activeSegment(segs, t))).toEqual([-1, 0, -1, 1, -1, -1]);
  });
  it("validates formats, size, and duration boundaries", () => {
    for (const ext of ["mp3", "m4a", "wav", "webm", "ogg"]) expect(validateAudioFile({ name: `a.${ext}`, type: "", size: 1 }, 1)).toBeNull();
    const file = { name: "a.mp3", type: "audio/mpeg", size: 100 * 1024 * 1024 };
    expect(validateAudioFile(file, 5400)).toBeNull();
    for (const f of [{ ...file, size: 0 }, { ...file, size: file.size + 1 }, { ...file, name: "x.exe" }, { ...file, type: "text/plain" }]) expect(validateAudioFile(f)).not.toBeNull();
    for (const d of [0, -1, Infinity, 5401]) expect(validateAudioFile(file, d)).not.toBeNull();
  });
});
