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
vi.mock("@/lib/db/moodboards", () => ({ ensureSystemBoards: vi.fn() }));
vi.mock("@/lib/market/ingest", () => ({ ingestReference: vi.fn() }));

import { ensureSystemBoards } from "@/lib/db/moodboards";
import { ingestReference } from "@/lib/market/ingest";

const params = Promise.resolve({ id: "client-1" });
const req = (body: unknown) =>
  new Request("http://test/api/clients/client-1/market/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/clients/[id]/market/references", () => {
  beforeEach(() => vi.resetAllMocks());

  it("ingests into the requested bucket with the caller as added_by", async () => {
    vi.mocked(ensureSystemBoards).mockResolvedValue({
      direct: { id: "bd", client_id: "client-1", name: "Direct", board_type: "direct", created_at: "t" },
      adjacent: { id: "ba", client_id: "client-1", name: "Adjacent", board_type: "adjacent", created_at: "t" },
    });
    vi.mocked(ingestReference).mockResolvedValue({ id: "item-1" } as never);

    const { POST } = await import("./route");
    const res = await POST(req({ url: "https://youtu.be/x", bucket: "adjacent", note: "n" }) as never, {
      params,
    });
    expect(res.status).toBe(201);
    expect(vi.mocked(ingestReference)).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: "ba",
        clientId: "client-1",
        url: "https://youtu.be/x",
        note: "n",
        addedBy: "user-1",
      }),
    );
  });

  it("rejects a missing url or bad bucket", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ bucket: "direct" }) as never, { params })).status).toBe(400);
    expect((await POST(req({ url: "https://x.com", bucket: "weird" }) as never, { params })).status).toBe(
      400,
    );
  });
});
