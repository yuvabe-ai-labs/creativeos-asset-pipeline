import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    email: "user-1@yuvabe.com",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));

// vi.mock factories are hoisted above top-level `const`s, so any variable a factory
// reads directly (not just closes over inside a nested function) must itself be
// declared via vi.hoisted() to avoid a TDZ ReferenceError at import time (same pattern
// as src/lib/auth/impersonation.test.ts).
const { resolveImpersonationStateMock, logMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async () => ({ isImpersonating: false }) as const),
  logMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));

vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme", org_id: "org-1" })),
}));

import { withClient } from "./route-helpers";

const params = Promise.resolve({ id: "client-1" });
function req(method: string) {
  return new NextRequest("http://localhost/api/clients/client-1", { method });
}

describe("withClient write-gating", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows GET when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("GET"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("blocks POST when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows GET even when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("GET"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when impersonating and elevated, and logs a write_action", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "org-1",
      eventType: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
  });

  it("does not log write_action for a blocked write", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    await withClient(req("POST"), params, vi.fn(async () => new Response(null, { status: 200 })));
    expect(logMock).not.toHaveBeenCalled();
  });
});
