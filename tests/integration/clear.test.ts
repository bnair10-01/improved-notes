import { beforeEach, describe, expect, it } from "vitest";
import { signOut as fbSignOut } from "firebase/auth";
import { doc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureSignedIn } from "@/lib/auth";
import { newId, nowIso, userCol, userDoc } from "@/lib/db";
import { saveNote } from "@/lib/notes";
import { createFolder, createNote, eraseEverything, loadVault, removeTopic, restoreNotes, snapshotVersion, trashAllNotes, updateNote } from "@/lib/vault";
import { createShareLink } from "@/lib/sharing";
import { PAGE, RESULT, resetEmulators } from "./helpers";

beforeEach(async () => {
  await fbSignOut(auth).catch(() => undefined);
  await resetEmulators();
  await ensureSignedIn();
});

const count = async (name: "notes" | "folders" | "links" | "flashcards" | "quizzes" | "attempts" | "attachments") => (await getDocs(userCol(name))).size;

describe("deleting topics and clearing notes", () => {
  it("deleting a topic keeps its notes by default, and sends them to Trash when asked", async () => {
    const a = await createFolder("Keep"), b = await createFolder("Bin");
    const keep = await createNote({ title: "stays", folder_id: a });
    const bin = await createNote({ title: "goes", folder_id: b });
    await removeTopic(a, false);
    await removeTopic(b, true);
    const v = await loadVault();
    expect(v.folders).toHaveLength(0);
    expect(v.notes.find((n) => n.id === keep)).toMatchObject({ folder_id: null, deleted_at: null });
    expect(v.notes.find((n) => n.id === bin)?.deleted_at).toBeTruthy();
  });

  it("clearing all notes moves them to Trash, recoverably", async () => {
    const ids = [await createNote({ title: "one" }), await createNote({ title: "two" })];
    expect((await trashAllNotes()).sort()).toEqual([...ids].sort());
    expect((await loadVault()).notes.every((n) => n.deleted_at)).toBe(true);
    await restoreNotes(ids);
    expect((await loadVault()).notes.every((n) => !n.deleted_at)).toBe(true);
  });

  it("erasing everything removes notes, history, links, topics, study data and share links for good", async () => {
    const folder = await createFolder("Topic");
    const a = await createNote({ title: "A", folder_id: folder });
    const b = await createNote({ title: "B" });
    const scan = await saveNote(null, [{ ...PAGE }], RESULT);
    await snapshotVersion(a, "A", "text", "test", true);
    await setDoc(userDoc("links", newId()), { from_note_id: a, to_note_id: b, kind: "manual", label: null, created_at: nowIso() });
    await setDoc(userDoc("flashcards", newId()), { note_id: a, front: "q", back: "a", card_type: "qa", due_at: nowIso() });
    await setDoc(userDoc("quizzes", newId()), { note_id: a, questions: [], created_at: nowIso() });
    await setDoc(userDoc("attempts", newId()), { quiz_id: null, flashcard_id: null, score: 1, created_at: nowIso() });
    const token = await createShareLink(a);
    await updateNote(scan, { pinned: true });

    await eraseEverything();

    for (const name of ["notes", "folders", "links", "flashcards", "quizzes", "attempts", "attachments"] as const) expect(await count(name), name).toBe(0);
    expect((await getDocs((await import("firebase/firestore")).collection(db, "users", auth.currentUser!.uid, "notes", a, "versions"))).size).toBe(0);
    expect((await (await import("firebase/firestore")).getDoc(doc(db, "shares", token))).exists()).toBe(false);
    expect(auth.currentUser).toBeTruthy(); // the account itself stays signed in
  });
});
