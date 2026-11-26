import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { makeEnv } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env.cleanup(); });

const bytes = new Uint8Array([1, 2, 3]);

describe("files are private to their owner", () => {
  it("the owner can write, read and delete their own files", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertSucceeds(uploadBytes(ref(s, "users/alice/images/n1/page-1.jpg"), bytes));
    await assertSucceeds(getBytes(ref(s, "users/alice/images/n1/page-1.jpg")));
    await assertSucceeds(deleteObject(ref(s, "users/alice/images/n1/page-1.jpg")));
  });

  it("other people and signed-out visitors cannot read or write them", async () => {
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext("alice").storage(), "users/alice/audio/n1/a.mp3"), bytes));
    const bob = env.authenticatedContext("bob").storage();
    await assertFails(getBytes(ref(bob, "users/alice/audio/n1/a.mp3")));
    await assertFails(uploadBytes(ref(bob, "users/alice/audio/n1/b.mp3"), bytes));
    await assertFails(deleteObject(ref(bob, "users/alice/audio/n1/a.mp3")));
    const anon = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anon, "users/alice/audio/n1/a.mp3")));
    await assertFails(uploadBytes(ref(anon, "users/alice/x.jpg"), bytes));
  });

  it("denies paths outside users/{uid}", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "stray/file.jpg"), bytes));
  });
});
