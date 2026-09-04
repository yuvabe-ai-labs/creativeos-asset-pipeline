import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "designer",
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
vi.mock("@/lib/db/signals", () => ({ createSignal: vi.fn() }));

import { createSignal } from "@/lib/db/signals";

const params = Promise.resolve({ id: "client-1" });
const req = (body: unknown) =>
  new Request("http://test/api/clients/client-1/market/signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/clients/[id]/market/signals", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a signal with the caller as created_by", async () => {
    vi.mocked(createSignal).mockResolvedValue({ id: "sig-1" } as never);
    const { POST } = await import("./route");
    const res = await POST(
      req({ name: "Tactile product opening", tags: ["Hook"], description: "d", itemIds: ["i1", "i2"] }) as never,
      { params },
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(createSignal)).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        name: "Tactile product opening",
        itemIds: ["i1", "i2"],
        createdBy: "user-1",
      }),
    );
  });

  it("rejects an empty name or missing itemIds array", async () => {
    const { POST } = await import("./route");
    expect(
      (await POST(req({ name: " ", tags: [], description: "", itemIds: [] }) as never, { params })).status,
    ).toBe(400);
    expect((await POST(req({ name: "x", tags: [], description: "" }) as never, { params })).status).toBe(400);
  });
});
