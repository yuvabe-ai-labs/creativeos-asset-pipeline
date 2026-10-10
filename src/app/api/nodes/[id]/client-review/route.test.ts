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
              data: { title: "Dosa film" }, active_version_id: null, created_at: "t", updated_at: "t",
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
  class ShareCodeTakenError extends Error {}
  return {
    ReviewExistsError,
    ShareCodeTakenError,
    getReviewByNodeId: vi.fn(),
    createReview: vi.fn(),
    listComments: vi.fn(async () => []),
  };
});
const params = Promise.resolve({ id: "n1" });
import {
  getReviewByNodeId,
  createReview,
  listComments,
  ReviewExistsError,
  ShareCodeTakenError,
} from "@/lib/db/client-reviews";

const PREFIX = "clients/c1/canvases/cv1/nodes/n1/client-review/";

function finalize(body: unknown) {
  return new NextRequest("http://localhost/api/nodes/n1/client-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/nodes/[id]/client-review", () => {
  beforeEach(() => {
    vi.mocked(getReviewByNodeId).mockReset();
    vi.mocked(createReview).mockReset();
    vi.mocked(listComments).mockResolvedValue([]);
  });

  it("GET returns review:null before a cut is uploaded", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/nodes/n1/client-review"), { params });
    expect(await res.json()).toEqual({ review: null, comments: [] });
  });

  it("GET returns the video URL and share code once a cut exists", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue({
      id: "r1", video_path: `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`, share_token: "b4b4",
    } as never);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/nodes/n1/client-review"), { params });
    const body = await res.json();
    expect(body.review).toEqual({ videoUrl: `https://cdn/${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`, shareToken: "b4b4" });
  });

  it("POST creates the review with a fresh token for a path inside the node", async () => {
    vi.mocked(createReview).mockImplementation(async (input) => ({
      id: "r1", canvas_id: input.canvasId, node_id: input.nodeId, org_id: "org-1",
      video_path: input.videoPath, share_token: input.shareToken, created_by: input.createdBy, created_at: "t",
    }));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`, filename: "cut__2026-10-06T08-54-55-123Z.mp4" }), { params });
    expect(res.status).toBe(201);
    const input = vi.mocked(createReview).mock.calls[0][0];
    expect(input).toMatchObject({ canvasId: "cv1", nodeId: "n1", videoPath: `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`, createdBy: "user-1" });
    // D311: the code is the node id's leading characters ("n1" here); the drawer adds the title.
    expect(input.shareToken).toBe("n1");
    expect((await res.json()).review.shareToken).toBe("n1");
  });

  it("POST retries one character longer when the share code is taken", async () => {
    vi.mocked(createReview)
      .mockRejectedValueOnce(new ShareCodeTakenError())
      .mockImplementation(async (input) => ({
        id: "r1", canvas_id: input.canvasId, node_id: input.nodeId, org_id: "org-1",
        video_path: input.videoPath, share_token: input.shareToken, created_by: input.createdBy, created_at: "t",
      }));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4` }), { params });
    expect(res.status).toBe(201);
    // The route retried after the clash instead of failing; the code growing one character
    // per retry is shareCodeFor's own contract (token.test.ts).
    expect(vi.mocked(createReview)).toHaveBeenCalledTimes(2);
  });

  it("POST 400s a path outside this node", async () => {
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: "clients/c1/canvases/cv1/nodes/OTHER/client-review/x.mp4", filename: "x.mp4" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(createReview)).not.toHaveBeenCalled();
  });

  it("POST 409s when the node already has a cut", async () => {
    vi.mocked(createReview).mockRejectedValue(new ReviewExistsError());
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`, filename: "cut__2026-10-06T08-54-55-123Z.mp4" }), { params });
    expect(res.status).toBe(409);
  });

  it("POST 400s a traversal path that starts with the node prefix", async () => {
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}../../../../../../clients/OTHER/x/generated.mp4`, filename: "x.mp4" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(createReview)).not.toHaveBeenCalled();
  });

  it("POST 404s when the node is not a client-review node", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabase: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "n1", canvas_id: "cv1", type: "draw", position: { x: 0, y: 0 },
                  data: { title: "Dosa film" }, active_version_id: null, created_at: "t", updated_at: "t",
                  canvases: { client_id: "c1", clients: { org_id: "org-1" } },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`, filename: "cut.mp4" }), { params });
    expect(res.status).toBe(404);
    vi.doUnmock("@/lib/supabase/server");
  });
});
