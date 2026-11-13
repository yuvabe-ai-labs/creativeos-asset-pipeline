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
    createVersion: vi.fn(),
    listVersions: vi.fn(async () => []),
    listReviewComments: vi.fn(async () => []),
  };
});
const params = Promise.resolve({ id: "n1" });
import {
  getReviewByNodeId,
  createReview,
  createVersion,
  listVersions,
  listReviewComments,
  ReviewExistsError,
  ShareCodeTakenError,
} from "@/lib/db/client-reviews";

const PREFIX = "clients/c1/canvases/cv1/nodes/n1/client-review/";
const CUT = `${PREFIX}cut__2026-10-06T08-54-55-123Z.mp4`;
const REVIEW = {
  id: "r1", canvas_id: "cv1", node_id: "n1", org_id: "org-1",
  share_token: "b4b4", created_by: "user-1", created_at: "t",
};
const versionRow = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `v${n}`, review_id: "r1", version_no: n, title: null, video_path: CUT, allow_download: true,
  legacy_link: false, created_by: "user-1", created_at: "t", ...extra,
});

function finalize(body: unknown) {
  return new NextRequest("http://localhost/api/nodes/n1/client-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reviewFor(input: { canvasId: string; nodeId: string; shareToken: string; createdBy: string }) {
  return { ...REVIEW, canvas_id: input.canvasId, node_id: input.nodeId, share_token: input.shareToken, created_by: input.createdBy };
}

describe("/api/nodes/[id]/client-review", () => {
  beforeEach(() => {
    vi.mocked(getReviewByNodeId).mockReset();
    vi.mocked(createReview).mockReset();
    vi.mocked(createVersion).mockReset();
    vi.mocked(listVersions).mockResolvedValue([]);
    vi.mocked(listReviewComments).mockResolvedValue([]);
  });

  it("GET returns review:null before a cut is uploaded", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/nodes/n1/client-review"), { params });
    expect(await res.json()).toEqual({ review: null, comments: [] });
  });

  it("GET returns the share code and every version, newest first (D495)", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(REVIEW);
    vi.mocked(listVersions).mockResolvedValue([versionRow(2, { allow_download: false }), versionRow(1, { legacy_link: true })]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/nodes/n1/client-review"), { params });
    const body = await res.json();
    expect(body.review.shareToken).toBe("b4b4");
    expect(body.review.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    expect(body.review.versions[0]).toMatchObject({ videoUrl: `https://cdn/${CUT}`, allowDownload: false, legacyLink: false });
    expect(body.review.versions[1].legacyLink).toBe(true);
  });

  it("POST on a new node creates the review and its v1, download on by default", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    vi.mocked(createReview).mockImplementation(async (input) => reviewFor(input));
    vi.mocked(createVersion).mockResolvedValue(versionRow(1));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: CUT, filename: "dosa_brand-film.mp4" }), { params });
    expect(res.status).toBe(201);
    const input = vi.mocked(createReview).mock.calls[0][0];
    expect(input).toMatchObject({ canvasId: "cv1", nodeId: "n1", createdBy: "user-1" });
    // D311: the code is the node id's leading characters ("n1" here); the focus view adds the title.
    expect(input.shareToken).toBe("n1");
    // The version is named after its file.
    expect(vi.mocked(createVersion)).toHaveBeenCalledWith({
      reviewId: "r1", videoPath: CUT, title: "dosa brand film", allowDownload: true, createdBy: "user-1",
    });
    expect((await res.json()).review.shareToken).toBe("n1");
  });

  it("POST on a node that has a review adds the next version, with the dialog's download choice", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(REVIEW);
    vi.mocked(createVersion).mockResolvedValue(versionRow(2, { allow_download: false }));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: CUT, allowDownload: false }), { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(createReview)).not.toHaveBeenCalled();
    expect(vi.mocked(createVersion)).toHaveBeenCalledWith({
      reviewId: "r1", videoPath: CUT, title: null, allowDownload: false, createdBy: "user-1",
    });
  });

  it("POST 400s an allowDownload that isn't a boolean", async () => {
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: CUT, allowDownload: "yes" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(createVersion)).not.toHaveBeenCalled();
  });

  it("POST retries one character longer when the share code is taken", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    vi.mocked(createReview)
      .mockRejectedValueOnce(new ShareCodeTakenError())
      .mockImplementation(async (input) => reviewFor(input));
    vi.mocked(createVersion).mockResolvedValue(versionRow(1));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: CUT }), { params });
    expect(res.status).toBe(201);
    // The route retried after the clash instead of failing; the code growing one character
    // per retry is shareCodeFor's own contract (token.test.ts).
    expect(vi.mocked(createReview)).toHaveBeenCalledTimes(2);
  });

  it("POST uses the review another upload made a moment ago", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValueOnce(null).mockResolvedValueOnce(REVIEW);
    vi.mocked(createReview).mockRejectedValue(new ReviewExistsError());
    vi.mocked(createVersion).mockResolvedValue(versionRow(2));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: CUT }), { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(createVersion).mock.calls[0][0].reviewId).toBe("r1");
  });

  it("POST 400s a path outside this node", async () => {
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: "clients/c1/canvases/cv1/nodes/OTHER/client-review/x.mp4", filename: "x.mp4" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(createVersion)).not.toHaveBeenCalled();
  });

  it("POST 400s a traversal path that starts with the node prefix", async () => {
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}../../../../../../clients/OTHER/x/generated.mp4`, filename: "x.mp4" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(createVersion)).not.toHaveBeenCalled();
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
