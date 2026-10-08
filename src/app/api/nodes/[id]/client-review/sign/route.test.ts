import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "user-1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
// withNode reads the node + org chain through the service-role client.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "n1", canvas_id: "cv1", type: "client-review", position: { x: 0, y: 0 },
              data: {}, active_version_id: null, created_at: "t", updated_at: "t",
              canvases: { client_id: "c1", clients: { org_id: "org-1" } },
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/storage", () => ({
  publicUrlFor: (p: string) => `https://cdn/${p}`,
  signClientReviewUpload: vi.fn(async () => ({ signedUrl: "https://signed", path: "p", url: "https://cdn/p" })),
}));
vi.mock("@/lib/db/client-reviews", async () => {
  class ReviewExistsError extends Error {}
  return {
    ReviewExistsError,
    getReviewByNodeId: vi.fn(),
    createReview: vi.fn(),
    listComments: vi.fn(async () => []),
  };
});
const params = Promise.resolve({ id: "n1" });
import { getReviewByNodeId } from "@/lib/db/client-reviews";
import { signClientReviewUpload } from "@/lib/storage";

function sign(body: unknown) {
  return new NextRequest("http://localhost/api/nodes/n1/client-review/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/nodes/[id]/client-review/sign", () => {
  beforeEach(() => vi.mocked(getReviewByNodeId).mockReset());

  it("signs an mp4 under the node's client-review folder", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "Final.MP4", contentType: "video/mp4", size: 1000 }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(signClientReviewUpload)).toHaveBeenCalledWith({
      clientId: "c1", canvasId: "cv1", nodeId: "n1", ext: "mp4", contentType: "video/mp4",
    });
  });

  it("400s a non-video file", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.png", contentType: "image/png", size: 10 }), { params });
    expect(res.status).toBe(400);
  });

  it("400s a file over 500 MB", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.mp4", contentType: "video/mp4", size: 524_288_001 }), { params });
    expect(res.status).toBe(400);
  });

  it("409s when the node already has a cut", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue({ id: "r1" } as never);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.mp4", contentType: "video/mp4", size: 10 }), { params });
    expect(res.status).toBe(409);
  });

  it("400s a non-positive size", async () => {
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.mp4", contentType: "video/mp4", size: -1 }), { params });
    expect(res.status).toBe(400);
  });

  it("400s a missing or non-video contentType", async () => {
    const { POST } = await import("./route");
    expect((await POST(sign({ filename: "a.mp4", size: 10 }), { params })).status).toBe(400);
    expect((await POST(sign({ filename: "a.mp4", contentType: "text/html", size: 10 }), { params })).status).toBe(400);
  });
});
