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
});
