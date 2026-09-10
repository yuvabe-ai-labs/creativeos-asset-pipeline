import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1", platformRole: "member", orgId: "org-1", orgRole: "designer",
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
vi.mock("@/lib/db/performance", () => ({
  isHandleTracked: vi.fn(),
  getLatestSnapshot: vi.fn(),
}));
vi.mock("@/lib/market/snapshot", () => ({ snapshotHandle: vi.fn() }));

import { isHandleTracked, getLatestSnapshot } from "@/lib/db/performance";
import { snapshotHandle } from "@/lib/market/snapshot";

const params = Promise.resolve({ id: "client-1" });
const req = (body: unknown = { handle: "prakritisattva" }) =>
  new Request("http://test/api/clients/client-1/performance/refresh", {
    method: "POST",
    body: JSON.stringify(body),
  });

const agoMinutes = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

describe("POST /api/clients/[id]/performance/refresh", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires a handle", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({}) as never, { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(snapshotHandle)).not.toHaveBeenCalled();
  });

  it("404s a handle this client does not track", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(false);
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(404);
    expect(vi.mocked(snapshotHandle)).not.toHaveBeenCalled();
  });

  it("refuses when THIS handle was snapshotted under an hour ago", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue({ captured_at: agoMinutes(10) } as never);
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(429);
    expect(vi.mocked(snapshotHandle)).not.toHaveBeenCalled();
  });

  it("guards per handle, not per client", async () => {
    // A different handle's recent snapshot must not block this one — otherwise one
    // refresh would freeze every other sub-tab for an hour.
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(snapshotHandle).mockResolvedValue({ ok: true, handle: "other", postCount: 3 });
    const { POST } = await import("./route");
    const res = await POST(req({ handle: "other" }) as never, { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(getLatestSnapshot)).toHaveBeenCalledWith("client-1", "other");
    expect(vi.mocked(snapshotHandle)).toHaveBeenCalledWith("client-1", "other");
  });

  it("runs the snapshot when the latest is old enough", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue({ captured_at: agoMinutes(120) } as never);
    vi.mocked(snapshotHandle).mockResolvedValue({ ok: true, handle: "prakritisattva", postCount: 12 });
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).postCount).toBe(12);
  });

  it("maps no-data to 409", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(snapshotHandle).mockResolvedValue({ ok: false, reason: "no-data" });
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(409);
  });
});
