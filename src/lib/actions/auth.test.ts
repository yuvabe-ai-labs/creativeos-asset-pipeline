import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted above top-level `const`s, so any variable a factory
// reads directly must itself be declared via vi.hoisted() to avoid a TDZ ReferenceError
// at import time (same pattern as src/lib/auth/impersonation.test.ts).
const { signOutMock, endImpersonationMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => ({ error: null })),
  endImpersonationMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/ssr-server", () => ({
  createSSRServerClient: vi.fn(async () => ({ auth: { signOut: signOutMock } })),
}));
vi.mock("@/lib/auth/impersonation", () => ({ endImpersonation: endImpersonationMock }));

import { logoutAction } from "./auth";

describe("logoutAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("signs out and ends any active impersonation session", async () => {
    await logoutAction();
    expect(signOutMock).toHaveBeenCalled();
    expect(endImpersonationMock).toHaveBeenCalled();
  });

  // Supabase's signOut() defaults to scope "global", which revokes EVERY session for the
  // account — every other device, browser and tab. This deployment has teams sharing a
  // single login, so the default meant one person signing out silently kicked all their
  // colleagues out mid-work (confirmed in staging auth logs: POST /auth/v1/logout?scope=global).
  // "local" ends only the session that asked to be ended.
  it("signs out only the current session, never every device on the account", async () => {
    await logoutAction();
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});
