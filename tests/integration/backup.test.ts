import { beforeEach, describe, expect, it } from "vitest";
import { signOut as fbSignOut } from "firebase/auth";
import { getDoc, getDocs, setDoc } from "firebase/firestore";
import { getBytes, ref } from "firebase/storage";
import JSZip from "jszip";
import { auth, storage } from "@/lib/firebase";
import { ensureSignedIn, signUpWithEmail } from "@/lib/auth";
import { saveNote } from "@/lib/notes";
import { createNote, listVersions, snapshotVersion, updateNote } from "@/lib/vault";
import { buildBackup, readManifest, restoreBackup } from "@/lib/backup";
import { noteVersions, userDoc } from "@/lib/db";
import { PAGE, RESULT, eventually, resetEmulators } from "./helpers";

beforeEach(async () => {
  await fbSignOut(auth).catch(() => undefined);
  await resetEmulators();
});

async function seedAccount(email: string) {
  await ensureSignedIn();
  const user = await signUpWithEmail(email, "secret12");
  const photo = await saveNote(null, [{ ...PAGE }], RESULT);
  const live = await createNote({ title: "Live note", markdown: "keep this" });
  const trashed = await createNote({ title: "In the trash", markdown: "still mine" });
  await updateNote(trashed, { deleted_at: new Date().toISOString() });
  await snapshotVersion(live, "Live note", "an earlier draft", "autosave", true);
  await setDoc(userDoc("flashcards", "card1"), { note_id: live, front: "Q", back: "A", card_type: "qa", due_at: "2026-11-26T00:00:00Z", reps: 0, interval_days: 0, ease: 2.5, created_at: "2026-11-26T00:00:00Z" });
  return { user, photo, live, trashed };
}

describe("backup and restore", () => {
  it("exports everything, including Trash, history and photos, as a readable zip", async () => {
    const a = await seedAccount("export@example.test");
    const bytes = await buildBackup();
    const manifest = await readManifest(bytes);
    expect(manifest.app).toBe("improved-notes");
    expect(manifest.counts).toMatchObject({ notes: 3, flashcards: 1, versions: 1, files: 1 });

    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names).toContain(`versions/${a.live}.json`);
    expect(names.some((n) => n.startsWith("files/images/"))).toBe(true);
    const md = names.filter((n) => n.startsWith("notes/") && n.endsWith(".md"));
    expect(md.length).toBe(2); // live notes only; the trashed one is in data/, not in the readable folder
    const notes = JSON.parse(await zip.file("data/notes.json")!.async("string")) as { id: string; deleted_at: string | null }[];
    expect(notes.find((n) => n.id === a.trashed)!.deleted_at).toEqual(expect.any(String)); // Trash is preserved
  });

  it("restores into a brand-new account, with Trash, history and photos intact", async () => {
    const a = await seedAccount("from@example.test");
    const bytes = await buildBackup();
    await fbSignOut(auth);

    await ensureSignedIn();
    const fresh = await signUpWithEmail("to@example.test", "secret12");
    expect(fresh.uid).not.toBe(a.user.uid);
    const summary = await restoreBackup(bytes);
    expect(summary).toMatchObject({ added: 4, skipped: 0, files: 1, versions: 1 }); // 3 notes + 1 flashcard

    expect((await getDoc(userDoc("notes", a.live))).get("markdown")).toBe("keep this");
    expect((await getDoc(userDoc("notes", a.trashed))).get("deleted_at")).toEqual(expect.any(String));
    expect((await getDoc(userDoc("flashcards", "card1"))).get("front")).toBe("Q");
    expect((await listVersions(a.live))[0]!.markdown).toBe("an earlier draft");
    const [path] = (await getDoc(userDoc("notes", a.photo))).get("image_paths") as string[];
    expect(path).toMatch(new RegExp(`^users/${fresh.uid}/`));
    expect((await getBytes(ref(storage, path!))).byteLength).toBeGreaterThan(0);
  });

  it("never overwrites what the account already has, and is safe to run twice", async () => {
    const a = await seedAccount("twice@example.test");
    const bytes = await buildBackup();
    await updateNote(a.live, { markdown: "edited after the backup" });

    const first = await restoreBackup(bytes);
    expect(first.added).toBe(0); // everything already exists
    expect(first.skipped).toBeGreaterThan(0);
    expect((await getDoc(userDoc("notes", a.live))).get("markdown")).toBe("edited after the backup");

    await restoreBackup(bytes);
    const versions = await getDocs(noteVersions(a.live));
    await eventually(() => versions.size >= 1);
    expect(versions.size).toBe(1); // no duplicate history
  });

  it("rejects files that aren't backups", async () => {
    await ensureSignedIn();
    const zip = new JSZip();
    zip.file("hello.txt", "not a backup");
    await expect(restoreBackup(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/isn't an Improved Notes backup/);
    const future = new JSZip();
    future.file("manifest.json", JSON.stringify({ app: "improved-notes", format: 999, exported_at: "", counts: {} }));
    await expect(restoreBackup(await future.generateAsync({ type: "uint8array" }))).rejects.toThrow(/newer version/);
  });
});
