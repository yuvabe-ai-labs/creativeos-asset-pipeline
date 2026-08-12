import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted above top-level `const`s, so any variable a factory
// reads directly must itself be declared via vi.hoisted() to avoid a TDZ ReferenceError
// at import time (same pattern as src/lib/auth/impersonation.test.ts).
const { signOutMock, endImpersonationMock, cookieDeleteMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => ({ error: null })),
  endImpersonationMock: vi.fn(async () => undefined),
  cookieDeleteMock: vi.fn(),
}));
vi.mock("@/lib/supabase/ssr-server", () => ({
  createSSRServerClient: vi.fn(async () => ({ auth: { signOut: signOutMock } })),
}));
vi.mock("@/lib/auth/impersonation", () => ({ endImpersonation: endImpersonationMock }));
// next/headers throws outside a request scope, so the cookie store is stubbed here.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: cookieDeleteMock, set: vi.fn() })),
}));

import { logoutAction } from "./auth";
import { REMEMBER_COOKIE } from "@/lib/auth/session-persistence";

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

  // The "Keep me signed in" preference belongs to the session that just ended. Left
  // behind, one user's choice would silently govern the next person to sign in on this
  // machine — which matters here precisely because teams share a login.
  it("clears the remember-me preference so it cannot outlive the session", async () => {
    await logoutAction();
    expect(cookieDeleteMock).toHaveBeenCalledWith(REMEMBER_COOKIE);
  });
});
