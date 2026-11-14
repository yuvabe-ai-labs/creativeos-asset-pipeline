import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1", slug: "acme", name: "Acme" })),
}));
vi.mock("@/lib/db/signals", () => ({ updateSignal: vi.fn(), deleteSignal: vi.fn() }));

import { updateSignal, deleteSignal } from "@/lib/db/signals";

// The signal id beside the client: the chokepoint checks client-1, so the write must be tied to
// client-1 too. A signal of another client (any agency) matches no row and answers 404.
const params = Promise.resolve({ id: "client-1", signalId: "sig-b" });
const req = (method: string, body?: unknown) =>
  new NextRequest("http://test/api/clients/client-1/market/signals/sig-b", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("/api/clients/[id]/market/signals/[signalId]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("PATCH scopes the update to the checked client", async () => {
    vi.mocked(updateSignal).mockResolvedValue(true);
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { name: "New" }), { params });
    expect(res.status).toBe(200);
    expect(updateSignal).toHaveBeenCalledWith("client-1", "sig-b", { name: "New" });
  });

  it("PATCH answers 404 for another client's signal", async () => {
    vi.mocked(updateSignal).mockResolvedValue(false);
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { name: "New" }), { params });
    expect(res.status).toBe(404);
  });

  it("DELETE scopes the delete to the checked client", async () => {
    vi.mocked(deleteSignal).mockResolvedValue(true);
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), { params });
    expect(res.status).toBe(200);
    expect(deleteSignal).toHaveBeenCalledWith("client-1", "sig-b");
  });

  it("DELETE answers 404 for another client's signal", async () => {
    vi.mocked(deleteSignal).mockResolvedValue(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), { params });
    expect(res.status).toBe(404);
  });
});
