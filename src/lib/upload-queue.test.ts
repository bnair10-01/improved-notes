// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueUpload, flushUploads, isNetworkError, pendingBlob, pendingUploads } from "./upload-queue";

const blob = (s: string) => new Blob([s], { type: "image/jpeg" });

beforeEach(async () => {
  await flushUploads(async () => undefined); // empty the queue between tests
});

describe("upload queue", () => {
  it("keeps files on the device until they are uploaded, oldest first", async () => {
    await enqueueUpload("users/u/images/a.jpg", blob("A"), "image/jpeg");
    await new Promise((r) => setTimeout(r, 5));
    await enqueueUpload("users/u/images/b.jpg", blob("B"), "image/jpeg");
    expect((await pendingUploads()).map((p) => p.path)).toEqual(["users/u/images/a.jpg", "users/u/images/b.jpg"]);

    const sent: string[] = [];
    const r = await flushUploads(async (i) => { sent.push(i.path); });
    expect(r).toEqual({ done: 2, failed: 0 });
    expect(sent).toEqual(["users/u/images/a.jpg", "users/u/images/b.jpg"]);
    expect(await pendingUploads()).toEqual([]);
  });

  it("a failed upload stays queued, with the attempt counted, and succeeds on the next try", async () => {
    await enqueueUpload("users/u/audio/x.mp3", blob("X"), "audio/mpeg");
    const up = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    expect(await flushUploads(up)).toEqual({ done: 0, failed: 1 });
    const [kept] = await pendingUploads();
    expect(kept!.attempts).toBe(1);
    expect(await flushUploads(up)).toEqual({ done: 1, failed: 0 });
    expect(await pendingUploads()).toEqual([]);
  });

  it("one bad file doesn't block the rest", async () => {
    await enqueueUpload("users/u/a", blob("1"), "image/jpeg");
    await new Promise((r) => setTimeout(r, 5));
    await enqueueUpload("users/u/b", blob("2"), "image/jpeg");
    const r = await flushUploads(async (i) => { if (i.path.endsWith("a")) throw new Error("boom"); });
    expect(r).toEqual({ done: 1, failed: 1 });
    expect((await pendingUploads()).map((p) => p.path)).toEqual(["users/u/a"]);
  });

  it("lets the app show a waiting file from the device", async () => {
    await enqueueUpload("users/u/images/p.jpg", blob("PIXELS"), "image/jpeg");
    expect(await (await pendingBlob("users/u/images/p.jpg"))!.text()).toBe("PIXELS");
    expect(await pendingBlob("users/u/images/none.jpg")).toBeNull();
  });

  it("queuing the same path twice keeps a single copy", async () => {
    await enqueueUpload("users/u/dup", blob("1"), "image/jpeg");
    await enqueueUpload("users/u/dup", blob("22"), "image/jpeg");
    expect(await pendingUploads()).toHaveLength(1);
  });

  it("only network failures are queued; permission errors are real errors", () => {
    expect(isNetworkError(Object.assign(new Error("x"), { code: "storage/retry-limit-exceeded" }))).toBe(true);
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError(Object.assign(new Error("denied"), { code: "storage/unauthorized" }))).toBe(false);
  });
});
