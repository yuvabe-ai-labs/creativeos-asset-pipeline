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
vi.mock("@/lib/db/performance", () => ({ getLatestSnapshot: vi.fn() }));
vi.mock("@/lib/market/snapshot", () => ({ snapshotClientHandle: vi.fn() }));

import { getLatestSnapshot } from "@/lib/db/performance";
import { snapshotClientHandle } from "@/lib/market/snapshot";

const params = Promise.resolve({ id: "client-1" });
const req = () =>
  new Request("http://test/api/clients/client-1/performance/refresh", { method: "POST" });

describe("POST /api/clients/[id]/performance/refresh", () => {
  beforeEach(() => vi.resetAllMocks());

  it("refuses when the latest snapshot is under an hour old", async () => {
    vi.mocked(getLatestSnapshot).mockResolvedValue({
      captured_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    } as never);
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(429);
    expect(vi.mocked(snapshotClientHandle)).not.toHaveBeenCalled();
  });

  it("runs the snapshot when the latest is old enough", async () => {
    vi.mocked(getLatestSnapshot).mockResolvedValue({
      captured_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    } as never);
    vi.mocked(snapshotClientHandle).mockResolvedValue({ ok: true, handle: "h", postCount: 12 });
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(200);
  });

  it("maps no-handle to 409", async () => {
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(snapshotClientHandle).mockResolvedValue({ ok: false, reason: "no-handle" });
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(409);
  });
});
