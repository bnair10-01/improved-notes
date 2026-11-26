import { beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut as fbSignOut, type Auth } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getFirestore, increment, onSnapshot, updateDoc, type Firestore } from "firebase/firestore";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureSignedIn, signUpWithEmail } from "@/lib/auth";
import { createNote, updateNote } from "@/lib/vault";
import { EDITOR_ID, classifyRemote } from "@/lib/conflict";
import { eventually, resetEmulators, sleep } from "./helpers";

/** "Device B": a completely separate client signed in to the same account. */
async function deviceB(email: string, password: string) {
  const app: FirebaseApp = initializeApp({ apiKey: "demo", projectId: "demo-improved-notes", appId: "1:0:web:b" }, `deviceB-${Math.random()}`);
  const bAuth: Auth = getAuth(app);
  connectAuthEmulator(bAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  const bDb: Firestore = getFirestore(app);
  connectFirestoreEmulator(bDb, "127.0.0.1", 8080);
  const user = (await signInWithEmailAndPassword(bAuth, email, password)).user;
  const notes = new Map<string, Record<string, unknown>>();
  const stop = onSnapshot(collection(bDb, "users", user.uid, "notes"), (s) => {
    s.docs.forEach((d) => notes.set(d.id, d.data()));
  });
  return { app, bDb, uid: user.uid, notes, close: async () => { stop(); await fbSignOut(bAuth); await deleteApp(app); } };
}

const EMAIL = "sync@example.test", PASSWORD = "secret12";
let uid = "";

beforeEach(async () => {
  await fbSignOut(auth).catch(() => undefined);
  await resetEmulators();
  await ensureSignedIn();
  uid = (await signUpWithEmail(EMAIL, PASSWORD)).uid;
});

describe("one account, two devices", () => {
  it("a note made on one device appears on the other, and edits flow back", async () => {
    const b = await deviceB(EMAIL, PASSWORD);
    expect(b.uid).toBe(uid); // same account on both devices

    const id = await createNote({ title: "From device A", markdown: "hello" });
    const seen = await eventually(() => b.notes.get(id));
    expect(seen["title"]).toBe("From device A");

    await updateDoc(doc(b.bDb, "users", uid, "notes", id), { title: "Edited on B", rev: increment(1) });
    await eventually(() => {
      let found = false;
      const stop = onSnapshot(doc(db, "users", uid, "notes", id), (s) => { if (s.get("title") === "Edited on B") found = true; });
      return sleep(300).then(() => { stop(); return found; });
    });
    await b.close();
  });

  it("writes made offline are kept and sync when the device reconnects", async () => {
    const b = await deviceB(EMAIL, PASSWORD);
    await disableNetwork(db);
    const started = Date.now();
    const id = await createNote({ title: "Written offline", markdown: "no signal" }); // must not hang
    expect(Date.now() - started).toBeLessThan(5000);

    await sleep(800);
    expect(b.notes.has(id)).toBe(false); // the other device can't see it yet

    await enableNetwork(db);
    const synced = await eventually(() => b.notes.get(id), 15000);
    expect(synced["markdown"]).toBe("no signal");
    await b.close();
  });

  it("an edit on another device is told apart from our own saves", async () => {
    const b = await deviceB(EMAIL, PASSWORD);
    const id = await createNote({ title: "Shared", markdown: "base" });
    await eventually(() => b.notes.get(id));

    // Our baseline is rev 1. We save locally (own echo), then B edits the same note.
    await updateNote(id, { markdown: "mine" });
    const afterOwn = await eventually(async () => {
      let rev = 0, editor: string | undefined;
      const stop = onSnapshot(doc(db, "users", uid, "notes", id), (s) => { rev = s.get("rev"); editor = s.get("last_editor"); });
      await sleep(300); stop();
      return rev > 1 ? { rev, editor } : null;
    });
    expect(classifyRemote({ remoteRev: afterOwn.rev, remoteEditor: afterOwn.editor, baseRev: 1, dirty: true })).toBe("own");

    await updateDoc(doc(b.bDb, "users", uid, "notes", id), { markdown: "theirs", rev: increment(1), last_editor: "device-b" });
    const remote = await eventually(async () => {
      let rev = 0, editor: string | undefined;
      const stop = onSnapshot(doc(db, "users", uid, "notes", id), (s) => { rev = s.get("rev"); editor = s.get("last_editor"); });
      await sleep(300); stop();
      return editor === "device-b" ? { rev, editor } : null;
    });
    expect(classifyRemote({ remoteRev: remote.rev, remoteEditor: remote.editor, baseRev: afterOwn.rev, dirty: true })).toBe("conflict");
    expect(classifyRemote({ remoteRev: remote.rev, remoteEditor: remote.editor, baseRev: afterOwn.rev, dirty: false })).toBe("apply");
    expect(EDITOR_ID).not.toBe("device-b");
    await b.close();
  });
});
