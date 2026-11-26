import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({ auth: { authStateReady: async () => undefined, currentUser: null } }));
vi.mock("./account", () => ({ carryGuestData: vi.fn() }));

import { dropStaleGuest } from "./auth";

const fake = (user: { isAnonymous: boolean } | null) => ({ authStateReady: async () => undefined, currentUser: user }) as never;

describe("guests are not remembered between visits", () => {
  beforeEach(() => sessionStorage.clear());

  it("signs out a guest left over from an earlier visit", async () => {
    const out = vi.fn(async () => undefined);
    await dropStaleGuest(fake({ isAnonymous: true }), out);
    expect(out).toHaveBeenCalledTimes(1);
  });

  it("keeps the guest of this tab, so a reload doesn't lose work", async () => {
    sessionStorage.setItem("guest-session", "1");
    const out = vi.fn(async () => undefined);
    await dropStaleGuest(fake({ isAnonymous: true }), out);
    expect(out).not.toHaveBeenCalled();
  });

  it("never touches a real account", async () => {
    const out = vi.fn(async () => undefined);
    await dropStaleGuest(fake({ isAnonymous: false }), out);
    await dropStaleGuest(fake(null), out);
    expect(out).not.toHaveBeenCalled();
  });

  it("does not throw if auth fails to start", async () => {
    await expect(dropStaleGuest({ authStateReady: async () => { throw new Error("x"); }, currentUser: null } as never, async () => undefined)).resolves.toBeUndefined();
  });
});
