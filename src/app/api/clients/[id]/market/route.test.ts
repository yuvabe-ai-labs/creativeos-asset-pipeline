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
vi.mock("@/lib/db/moodboards", () => ({
  ensureSystemBoards: vi.fn(),
  listItems: vi.fn(),
}));
vi.mock("@/lib/db/signals", () => ({ listSignalsWithItems: vi.fn() }));

import { ensureSystemBoards, listItems } from "@/lib/db/moodboards";
import { listSignalsWithItems } from "@/lib/db/signals";

const params = Promise.resolve({ id: "client-1" });
const req = () => new Request("http://test/api/clients/client-1/market");

describe("GET /api/clients/[id]/market", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns both system boards with items and the signals", async () => {
    vi.mocked(ensureSystemBoards).mockResolvedValue({
      direct: { id: "bd", client_id: "client-1", name: "Direct", board_type: "direct", created_at: "t" },
      adjacent: { id: "ba", client_id: "client-1", name: "Adjacent", board_type: "adjacent", created_at: "t" },
    });
    vi.mocked(listItems).mockResolvedValue([]);
    vi.mocked(listSignalsWithItems).mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.direct.board.id).toBe("bd");
    expect(body.adjacent.board.id).toBe("ba");
    expect(body.signals).toEqual([]);
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("bd");
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("ba");
  });
});
