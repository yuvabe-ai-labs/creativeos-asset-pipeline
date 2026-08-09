import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImpersonationEvent } from "@/lib/db/impersonation-audit";
import type { OrgRow } from "@/lib/db/organizations";

vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted above top-level `const`s, so any variable a factory
// reads directly (not just closes over inside a nested function) must itself be
// declared via vi.hoisted() to avoid a TDZ ReferenceError at import time.
const { cookieStore, logMock, getOrgByIdMock } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  logMock: vi.fn(async (_event: ImpersonationEvent) => undefined),
  getOrgByIdMock: vi.fn(
    async (_id: string): Promise<OrgRow | null> => ({
      id: "target-org",
      name: "Target Org",
      slug: "target-org",
      monthly_credit_limit: null,
      created_at: new Date().toISOString(),
    }),
  ),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "op-1",
    platformRole: "super_admin",
    orgId: "yuvabe-org",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveCallerContextOrNull: vi.fn(async () => ({
    userId: "op-1",
    platformRole: "super_admin",
    orgId: "yuvabe-org",
    orgRole: "owner",
    mustChangePassword: false,
  })),
}));

vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: getOrgByIdMock }));

import { resolveCallerContextOrNull } from "@/lib/dal";
import {
  resolveImpersonationState,
  startImpersonation,
  enterElevatedMode,
  endImpersonation,
} from "./impersonation";
import { encodeImpersonationCookie } from "./impersonation-logic";

const SECRET = "test-secret";

function validCookieValue(overrides: Partial<{ elevated: boolean; expiresAt: string }> = {}) {
  return encodeImpersonationCookie(
    {
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: overrides.elevated ?? false,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    SECRET,
  );
}

describe("resolveImpersonationState", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("returns not-impersonating when no cookie is set", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns the impersonation state for a valid cookie", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue({ elevated: true }) });
    await expect(resolveImpersonationState()).resolves.toEqual({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: true,
    });
  });

  it("returns not-impersonating when the cookie is expired", async () => {
    cookieStore.get.mockReturnValue({
      value: validCookieValue({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    });
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns not-impersonating when the operator's live role is no longer super_admin (D81)", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    vi.mocked(resolveCallerContextOrNull).mockResolvedValueOnce({
      userId: "op-1",
      platformRole: "member",
      orgId: "yuvabe-org",
      orgRole: "owner",
      mustChangePassword: false,
    });
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns not-impersonating when there is no active session (D81, no redirect loop on /login)", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    vi.mocked(resolveCallerContextOrNull).mockResolvedValueOnce(null);
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns not-impersonating when IMPERSONATION_COOKIE_SECRET is unset (fail closed)", async () => {
    delete process.env.IMPERSONATION_COOKIE_SECRET;
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });
});

describe("startImpersonation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("sets the cookie and logs session_started", async () => {
    cookieStore.get.mockReturnValue(undefined); // no prior session to end
    await startImpersonation("target-org");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("impersonation");
    expect(typeof value).toBe("string");
    expect(options).toMatchObject({ httpOnly: true, path: "/" });
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "session_started",
    });
  });

  it("throws when the target org doesn't exist (I3)", async () => {
    cookieStore.get.mockReturnValue(undefined);
    getOrgByIdMock.mockResolvedValueOnce(null);
    await expect(startImpersonation("missing-org")).rejects.toThrow("Organization not found.");
    // no half-applied state: neither the cookie nor the audit log should have been touched
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("ends the prior session before starting the new one when re-entering (I2)", async () => {
    // A prior session is already active, targeting "target-org" (the default cookie fixture).
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    getOrgByIdMock.mockResolvedValueOnce({
      id: "other-org",
      name: "Other Org",
      slug: "other-org",
      monthly_credit_limit: null,
      created_at: new Date().toISOString(),
    });

    await startImpersonation("other-org");

    expect(cookieStore.delete).toHaveBeenCalledWith("impersonation");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [, , options] = cookieStore.set.mock.calls[0];
    expect(options).toMatchObject({ httpOnly: true, path: "/" });

    expect(logMock).toHaveBeenCalledTimes(2);
    // Order matters: the old session's session_ended must be logged before the new
    // session's session_started, not just that both eventually happen.
    expect(logMock.mock.calls[0][0]).toEqual({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "session_ended",
    });
    expect(logMock.mock.calls[1][0]).toEqual({
      operatorId: "op-1",
      targetOrgId: "other-org",
      eventType: "session_started",
    });
  });
});

describe("enterElevatedMode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("re-sets the cookie with elevated: true and logs elevated_mode_entered", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue({ elevated: false }) });
    await enterElevatedMode();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "elevated_mode_entered",
    });
  });

  it("no-ops when there is no active impersonation session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await enterElevatedMode();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});

describe("endImpersonation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("deletes the cookie and logs session_ended", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    await endImpersonation();
    expect(cookieStore.delete).toHaveBeenCalledWith("impersonation");
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "session_ended",
    });
  });

  it("still deletes the cookie but skips the audit log when there is no active session (I4)", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await endImpersonation();
    // I4: delete is unconditional — never leave an unclearable cookie behind, even
    // though there was nothing to decode here.
    expect(cookieStore.delete).toHaveBeenCalledWith("impersonation");
    // Still no audit entry for a session that never existed — that guarantee is unchanged.
    expect(logMock).not.toHaveBeenCalled();
  });
});
