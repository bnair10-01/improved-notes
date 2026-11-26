import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { signOut as fbSignOut } from "firebase/auth";
import { getBytes, ref } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { ensureSignedIn } from "@/lib/auth";
import { uploadPending } from "@/lib/notes";
import { enqueueUpload, flushUploads, pendingUploads } from "@/lib/upload-queue";
import { resetEmulators } from "./helpers";

beforeEach(async () => { await fbSignOut(auth).catch(() => undefined); await resetEmulators(); });

describe("offline files reach Storage once the connection returns", () => {
  it("flushes queued files into the person's own folder, and empties the queue", async () => {
    const user = await ensureSignedIn();
    const path = `users/${user.uid}/images/n1/page-1.jpg`;
    await enqueueUpload(path, new Blob(["offline photo"], { type: "image/jpeg" }), "image/jpeg");
    expect(await pendingUploads()).toHaveLength(1);

    expect(await flushUploads(uploadPending)).toEqual({ done: 1, failed: 0 });
    expect(new TextDecoder().decode(await getBytes(ref(storage, path)))).toBe("offline photo");
    expect(await pendingUploads()).toHaveLength(0);
  });

  it("keeps a file queued if the server refuses it (someone else's folder), instead of dropping it", async () => {
    await ensureSignedIn();
    await enqueueUpload("users/someone-else/images/x.jpg", new Blob(["x"]), "image/jpeg");
    expect(await flushUploads(uploadPending)).toEqual({ done: 0, failed: 1 });
    expect(await pendingUploads()).toHaveLength(1); // still safe on the device
    await flushUploads(async () => undefined); // clean up
  });
});
