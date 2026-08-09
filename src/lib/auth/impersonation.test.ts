import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted above top-level `const`s, so any variable a factory
// reads directly (not just closes over inside a nested function) must itself be
// declared via vi.hoisted() to avoid a TDZ ReferenceError at import time.
const { cookieStore, logMock } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  logMock: vi.fn(async () => undefined),
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

  it("no-ops when there is no active impersonation session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await endImpersonation();
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});
