import { describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({ auth: {} }));
vi.mock("./account", () => ({ carryGuestData: vi.fn() }));

import { authMessage } from "./auth";

describe("authMessage", () => {
  it("explains a provider that isn't switched on instead of showing a raw code", () => {
    expect(authMessage({ code: "auth/operation-not-allowed" })).toMatch(/isn't switched on/i);
  });
  it("tells people what to do about a blocked pop-up", () => {
    expect(authMessage({ code: "auth/popup-blocked" })).toMatch(/allow pop-ups/i);
  });
  it("keeps wrong-password and unknown-user answers identical, so accounts can't be probed", () => {
    expect(authMessage({ code: "auth/wrong-password" })).toBe(authMessage({ code: "auth/user-not-found" }));
  });
});
