import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

const currentUser: { uid: string } | null = { uid: "" };
let signedIn = false;
const uploadBytes = vi.fn();
const setDoc = vi.fn();
const updateDoc = vi.fn();
const docPaths: string[][] = [];

vi.mock("@/lib/firebase", () => ({
  get auth() { return { currentUser: signedIn ? currentUser : null }; },
  app: {},
  db: {},
  storage: {},
  USE_EMULATORS: false,
  firebaseConfigured: true,
  getAppCheck: () => null,
}));
vi.mock("firebase/storage", () => ({
  ref: (_s: unknown, path: string) => ({ path }),
  uploadBytes: (...args: unknown[]) => uploadBytes(...args),
  getDownloadURL: async () => "https://example.test/file",
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => { docPaths.push(segments); return { segments }; },
  collection: (_db: unknown, ...segments: string[]) => ({ segments }),
  setDoc: (...args: unknown[]) => { setDoc(...args); return Promise.resolve(); },
  updateDoc: (...args: unknown[]) => { updateDoc(...args); return Promise.resolve(); },
  deleteDoc: async () => undefined,
  increment: (n: number) => ({ increment: n }),
}));

const page = { id: "p1", dataUrl: "data:image/jpeg;base64,AAAA", path: "" };
const result = { title: "T", markdown: "m", uncertain_spans: [], structure: { nodes: [], edges: [] } };

describe("Notes are private to the signed-in person", () => {
  beforeEach(() => {
    signedIn = false;
    currentUser!.uid = "";
    uploadBytes.mockReset();
    setDoc.mockReset();
    updateDoc.mockReset();
    docPaths.length = 0;
  });

  it("History sits behind the sign-in guard", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const ids = router.matchRoutes("/history").map((m) => m.routeId);
    expect(ids).toContain("/_authenticated");
  });

  it("refuses to save a note when nobody is signed in", async () => {
    const { saveNote } = await import("@/lib/notes");
    await expect(saveNote(null, [page], result)).rejects.toThrow(/sign in/i);
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("stores photos and the note under the person's own users/{uid} folder", async () => {
    signedIn = true;
    currentUser!.uid = "u-77";
    uploadBytes.mockResolvedValue(undefined);
    const { saveNote } = await import("@/lib/notes");
    await saveNote(null, [page], result);
    expect(uploadBytes).toHaveBeenCalledTimes(1);
    const path = (uploadBytes.mock.calls[0]?.[0] as { path: string }).path;
    expect(path.startsWith("users/u-77/")).toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(docPaths.some((p) => p[0] === "users" && p[1] === "u-77" && p[2] === "notes")).toBe(true);
  });

  it("'delete' only moves a note to Trash and never removes it", async () => {
    signedIn = true;
    currentUser!.uid = "u-77";
    const { trashNote } = await import("@/lib/notes");
    await trashNote("n1");
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const patch = updateDoc.mock.calls[0]?.[1] as { deleted_at: string };
    expect(typeof patch.deleted_at).toBe("string");
  });
});
