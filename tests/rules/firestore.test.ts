import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { makeEnv, note } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const seed = (path: string, data: object) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("ownership", () => {
  it("lets a person create, read and update their own notes", async () => {
    const db = as("alice");
    await assertSucceeds(setDoc(doc(db, "users/alice/notes/n1"), note()));
    await assertSucceeds(getDoc(doc(db, "users/alice/notes/n1")));
    await assertSucceeds(updateDoc(doc(db, "users/alice/notes/n1"), { title: "New" }));
  });

  it("blocks other people and signed-out visitors from reading or writing", async () => {
    await seed("users/alice/notes/n1", note());
    await assertFails(getDoc(doc(as("bob"), "users/alice/notes/n1")));
    await assertFails(setDoc(doc(as("bob"), "users/alice/notes/n2"), note()));
    await assertFails(updateDoc(doc(as("bob"), "users/alice/notes/n1"), { title: "hacked" }));
    await assertFails(getDoc(doc(anon(), "users/alice/notes/n1")));
    await assertFails(getDocs(collection(anon(), "users/alice/notes")));
  });

  it("covers the other per-user collections too", async () => {
    for (const c of ["folders", "links", "flashcards", "quizzes", "attempts", "attachments", "settings"]) {
      await assertSucceeds(setDoc(doc(as("alice"), `users/alice/${c}/x`), { a: 1 }));
      await assertFails(getDoc(doc(as("bob"), `users/alice/${c}/x`)));
      await assertFails(setDoc(doc(as("bob"), `users/alice/${c}/y`), { a: 1 }));
    }
  });

  it("denies anything outside the known paths", async () => {
    await assertFails(setDoc(doc(as("alice"), "stray/doc"), { a: 1 }));
    await assertFails(getDoc(doc(as("alice"), "stray/doc")));
  });
});

describe("notes are never deleted unless they are in Trash", () => {
  it("refuses to delete a live note", async () => {
    await seed("users/alice/notes/n1", note());
    await assertFails(deleteDoc(doc(as("alice"), "users/alice/notes/n1")));
  });

  it("refuses to delete a note whose deleted_at was never set", async () => {
    await seed("users/alice/notes/n1", { title: "legacy, no deleted_at field" });
    await assertFails(deleteDoc(doc(as("alice"), "users/alice/notes/n1")));
  });

  it("moving to Trash is allowed, and then permanent delete is allowed", async () => {
    await seed("users/alice/notes/n1", note());
    const db = as("alice");
    await assertSucceeds(updateDoc(doc(db, "users/alice/notes/n1"), { deleted_at: "2026-11-25T01:00:00Z" }));
    await assertSucceeds(deleteDoc(doc(db, "users/alice/notes/n1")));
  });

  it("a restored note is protected again", async () => {
    await seed("users/alice/notes/n1", note({ deleted_at: "2026-11-25T01:00:00Z" }));
    const db = as("alice");
    await assertSucceeds(updateDoc(doc(db, "users/alice/notes/n1"), { deleted_at: null }));
    await assertFails(deleteDoc(doc(db, "users/alice/notes/n1")));
  });

  it("nobody else can delete someone's trashed note", async () => {
    await seed("users/alice/notes/n1", note({ deleted_at: "2026-11-25T01:00:00Z" }));
    await assertFails(deleteDoc(doc(as("bob"), "users/alice/notes/n1")));
    await assertFails(deleteDoc(doc(anon(), "users/alice/notes/n1")));
  });
});

describe("version history", () => {
  const v = { title: "T", markdown: "old text", reason: "autosave", created_at: "2026-11-25T00:00:00Z" };

  it("the owner can add and read versions but never edit them", async () => {
    await seed("users/alice/notes/n1", note());
    const db = as("alice");
    await assertSucceeds(setDoc(doc(db, "users/alice/notes/n1/versions/v1"), v));
    await assertSucceeds(getDoc(doc(db, "users/alice/notes/n1/versions/v1")));
    await assertFails(updateDoc(doc(db, "users/alice/notes/n1/versions/v1"), { markdown: "rewritten" }));
  });

  it("versions of a live note cannot be deleted", async () => {
    await seed("users/alice/notes/n1", note());
    await seed("users/alice/notes/n1/versions/v1", v);
    await assertFails(deleteDoc(doc(as("alice"), "users/alice/notes/n1/versions/v1")));
  });

  it("versions can be removed once the note is in Trash", async () => {
    await seed("users/alice/notes/n1", note({ deleted_at: "2026-11-25T01:00:00Z" }));
    await seed("users/alice/notes/n1/versions/v1", v);
    await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/notes/n1/versions/v1")));
  });

  it("other people cannot read or add versions", async () => {
    await seed("users/alice/notes/n1", note());
    await seed("users/alice/notes/n1/versions/v1", v);
    await assertFails(getDoc(doc(as("bob"), "users/alice/notes/n1/versions/v1")));
    await assertFails(setDoc(doc(as("bob"), "users/alice/notes/n1/versions/v2"), v));
  });
});

describe("share links", () => {
  const share = (over: object = {}) => ({ user_id: "alice", note_id: "n1", enabled: true, ...over });

  it("only the owner can create a link, and only for their own existing note", async () => {
    await seed("users/alice/notes/n1", note());
    await assertSucceeds(setDoc(doc(as("alice"), "shares/tok1"), share()));
    await assertFails(setDoc(doc(as("bob"), "shares/tok2"), share())); // claims alice's user_id
    await assertFails(setDoc(doc(as("bob"), "shares/tok3"), share({ user_id: "bob" }))); // bob has no note n1
    await assertFails(setDoc(doc(anon(), "shares/tok4"), share()));
  });

  it("anyone with the token can fetch the link, but nobody can list links", async () => {
    await seed("shares/tok1", share());
    await assertSucceeds(getDoc(doc(anon(), "shares/tok1")));
    await assertFails(getDocs(collection(anon(), "shares")));
    await assertFails(getDocs(collection(as("bob"), "shares")));
  });

  it("a live link lets a signed-out visitor read exactly that note", async () => {
    await seed("shares/tok1", share());
    await seed("users/alice/notes/n1", note({ shared_token: "tok1" }));
    await seed("users/alice/notes/n2", note({ title: "private" }));
    await assertSucceeds(getDoc(doc(anon(), "users/alice/notes/n1")));
    await assertFails(getDoc(doc(anon(), "users/alice/notes/n2")));
    await assertFails(getDocs(collection(anon(), "users/alice/notes")));
  });

  it("is read-only for visitors", async () => {
    await seed("shares/tok1", share());
    await seed("users/alice/notes/n1", note({ shared_token: "tok1" }));
    await assertFails(updateDoc(doc(anon(), "users/alice/notes/n1"), { title: "x" }));
    await assertFails(deleteDoc(doc(anon(), "users/alice/notes/n1")));
  });

  it("turning the link off takes effect immediately", async () => {
    await seed("shares/tok1", share());
    await seed("users/alice/notes/n1", note({ shared_token: "tok1" }));
    await assertSucceeds(getDoc(doc(anon(), "users/alice/notes/n1")));
    await assertSucceeds(updateDoc(doc(as("alice"), "shares/tok1"), { enabled: false }));
    await assertFails(getDoc(doc(anon(), "users/alice/notes/n1")));
  });

  it("a link cannot be pointed at a different note or owner", async () => {
    await seed("users/alice/notes/n1", note());
    await seed("shares/tok1", share());
    await assertFails(updateDoc(doc(as("alice"), "shares/tok1"), { note_id: "n2" }));
    await assertFails(updateDoc(doc(as("bob"), "shares/tok1"), { enabled: false }));
  });

  it("a token cannot expose a note it wasn't made for", async () => {
    await seed("shares/tok1", share()); // tok1 is for n1
    await seed("users/alice/notes/n2", note({ shared_token: "tok1" }));
    await assertFails(getDoc(doc(anon(), "users/alice/notes/n2")));
  });

  it("a trashed note is no longer visible through its link", async () => {
    await seed("shares/tok1", share());
    await seed("users/alice/notes/n1", note({ shared_token: "tok1", deleted_at: "2026-11-25T01:00:00Z" }));
    await assertFails(getDoc(doc(anon(), "users/alice/notes/n1")));
  });
});
