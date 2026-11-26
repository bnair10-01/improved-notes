import { beforeEach, describe, expect, it } from "vitest";
import { signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc, getDocs } from "firebase/firestore";
import { getBytes, ref } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { ensureSignedIn, isPermanent, signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { saveNote, signedUrls, trashNote, restoreNote } from "@/lib/notes";
import { createNote, listVersions, loadVault, purgeNote, restoreVersion, snapshotVersion, updateNote } from "@/lib/vault";
import { createShareLink, getSharedNote, setShareEnabled } from "@/lib/sharing";
import { noteVersions, userCol, userDoc } from "@/lib/db";
import { PAGE, RESULT, eventually, resetEmulators } from "./helpers";

beforeEach(async () => {
  await fbSignOut(auth).catch(() => undefined);
  await resetEmulators();
});

const fresh = () => ({ ...PAGE });

describe("guest to account", () => {
  it("a guest can capture and save a note, with the photo stored in their own folder", async () => {
    const guest = await ensureSignedIn();
    expect(guest.isAnonymous).toBe(true);
    const id = await saveNote(null, [fresh()], RESULT);
    const snap = await getDoc(userDoc("notes", id));
    expect(snap.get("title")).toBe("Cells");
    expect(snap.get("deleted_at")).toBeNull();
    const [path] = snap.get("image_paths") as string[];
    expect(path).toMatch(new RegExp(`^users/${guest.uid}/images/${id}/`));
    expect((await getBytes(ref(storage, path!))).byteLength).toBeGreaterThan(0);
    expect((await signedUrls([path!]))[0]).toMatch(/^http/);
  });

  it("signing up keeps the same account id and everything the guest made", async () => {
    const guest = await ensureSignedIn();
    const id = await saveNote(null, [fresh()], RESULT);
    const user = await signUpWithEmail("alice@example.test", "secret12");
    expect(user.uid).toBe(guest.uid);
    expect(isPermanent(user)).toBe(true);
    expect((await getDoc(userDoc("notes", id))).exists()).toBe(true);
  });

  it("signing in to an existing account brings the guest's notes and photos along", async () => {
    // An existing account with one note.
    await ensureSignedIn();
    await signUpWithEmail("bob@example.test", "secret12");
    const existing = await createNote({ title: "Already there" });
    await fbSignOut(auth);

    // A new guest on another device captures a note, then signs in to that account.
    const guest = await ensureSignedIn();
    const guestNote = await saveNote(null, [fresh()], { ...RESULT, title: "From a guest" });
    const user = await signInWithEmail("bob@example.test", "secret12");
    expect(user.uid).not.toBe(guest.uid);

    const vault = await eventually(async () => {
      const v = await loadVault();
      return v.notes.length === 2 ? v : null;
    });
    expect(vault.notes.map((n) => n.id).sort()).toEqual([existing, guestNote].sort());
    const moved = await getDoc(userDoc("notes", guestNote));
    const [path] = moved.get("image_paths") as string[];
    expect(path).toMatch(new RegExp(`^users/${user.uid}/`)); // rewritten to the new owner's folder
    expect((await getBytes(ref(storage, path!))).byteLength).toBeGreaterThan(0);
  });
});

describe("nothing is deleted silently", () => {
  it("'delete' moves a note to Trash; it can be restored", async () => {
    await ensureSignedIn();
    const id = await saveNote(null, [], RESULT);
    await trashNote(id);
    expect((await getDoc(userDoc("notes", id))).get("deleted_at")).toEqual(expect.any(String));
    await restoreNote(id);
    expect((await getDoc(userDoc("notes", id))).get("deleted_at")).toBeNull();
  });

  it("refuses to permanently delete a live note, even if the app asks", async () => {
    await ensureSignedIn();
    const id = await createNote({ title: "Keep me" });
    await expect(purgeNote(id)).rejects.toThrow();
    expect((await getDoc(userDoc("notes", id))).exists()).toBe(true);
  });

  it("permanently deletes a trashed note together with its history and links", async () => {
    await ensureSignedIn();
    const a = await createNote({ title: "A", markdown: "first draft" });
    const b = await createNote({ title: "B" });
    await snapshotVersion(a, "A", "first draft", "autosave", true);
    const { addLink } = await import("@/lib/vault");
    await addLink(a, b);
    await updateNote(a, { deleted_at: new Date().toISOString() });
    await purgeNote(a);
    expect((await getDoc(userDoc("notes", a))).exists()).toBe(false);
    expect((await getDocs(noteVersions(a))).size).toBe(0);
    expect((await getDocs(userCol("links"))).size).toBe(0);
    expect((await getDoc(userDoc("notes", b))).exists()).toBe(true);
  });
});

describe("version history", () => {
  it("records versions as the note is edited and can restore an earlier one", async () => {
    await ensureSignedIn();
    const id = await createNote({ title: "Essay", markdown: "" });
    await updateNote(id, { title: "Essay", markdown: "version one" });
    await updateNote(id, { title: "Essay", markdown: "version two" }); // throttled: still one snapshot
    const versions = await eventually(async () => {
      const v = await listVersions(id);
      return v.length ? v : null;
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.markdown).toBe("version one");

    await restoreVersion(id, versions[0]!, { title: "Essay", markdown: "version two" });
    expect((await getDoc(userDoc("notes", id))).get("markdown")).toBe("version one");
    const after = await listVersions(id);
    expect(after.some((v) => v.reason === "before-restore" && v.markdown === "version two")).toBe(true); // restore is undoable
  });
});

describe("share links", () => {
  it("a signed-out visitor sees the live note, and the link stops working when turned off", async () => {
    await ensureSignedIn();
    await signUpWithEmail("carol@example.test", "secret12");
    const id = await createNote({ title: "Public notes", markdown: "hello world" });
    const token = await createShareLink(id);
    await updateNote(id, { markdown: "hello again" }); // edits show up: the link is live

    await fbSignOut(auth);
    expect(await getSharedNote(token)).toEqual({ title: "Public notes", markdown: "hello again" });
    expect(await getSharedNote("not-a-real-token")).toBeNull();

    await signInWithEmail("carol@example.test", "secret12");
    await setShareEnabled(token, false);
    await fbSignOut(auth);
    expect(await getSharedNote(token)).toBeNull();
  });
});

describe("vault", () => {
  it("lists notes, newest first", async () => {
    await ensureSignedIn();
    const a = await createNote({ title: "Older" });
    await new Promise((r) => setTimeout(r, 15));
    const b = await createNote({ title: "Newer" });
    const v = await loadVault();
    expect(v.notes.map((n) => n.id)).toEqual([b, a]);
    expect(doc).toBeTypeOf("function");
  });
});
