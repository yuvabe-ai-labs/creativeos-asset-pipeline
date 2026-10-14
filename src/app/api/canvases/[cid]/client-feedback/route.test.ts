import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "u1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
// withCanvas resolves canvas → client → org through the service-role client.
const canvasOrg = { value: "org-1" };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "cv1", clients: { org_id: canvasOrg.value } },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/db/client-reviews", () => ({ listCanvasClientFeedback: vi.fn() }));

import { listCanvasClientFeedback } from "@/lib/db/client-reviews";

const params = Promise.resolve({ cid: "cv1" });

describe("GET /api/canvases/[cid]/client-feedback", () => {
  beforeEach(() => {
    vi.mocked(listCanvasClientFeedback).mockReset();
    canvasOrg.value = "org-1";
  });

  it("returns each review node's comment count and the total", async () => {
    vi.mocked(listCanvasClientFeedback).mockResolvedValue({
      nodes: [{ nodeId: "n1", title: "Dosa film", count: 3 }],
      total: 3,
    });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/canvases/cv1/client-feedback"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nodes: [{ nodeId: "n1", title: "Dosa film", count: 3 }], total: 3 });
    expect(vi.mocked(listCanvasClientFeedback)).toHaveBeenCalledWith("cv1");
  });

  it("404s a canvas in another org without reading feedback", async () => {
    canvasOrg.value = "org-OTHER";
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/canvases/cv1/client-feedback"), { params });
    expect(res.status).toBe(404);
    expect(vi.mocked(listCanvasClientFeedback)).not.toHaveBeenCalled();
  });
});
