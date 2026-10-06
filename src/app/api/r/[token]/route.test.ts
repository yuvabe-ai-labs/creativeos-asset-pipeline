import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/storage", () => ({ publicUrlFor: (p: string) => `https://cdn/${p}` }));
vi.mock("@/lib/db/client-reviews", () => ({
  getReviewByToken: vi.fn(),
  listComments: vi.fn(),
  insertComment: vi.fn(),
  updateComment: vi.fn(),
}));
import { getReviewByToken, listComments } from "@/lib/db/client-reviews";
const TOKEN = "a".repeat(43);
const review = {
  id: "r1", canvas_id: "cv-secret", node_id: "n-secret", org_id: "org-secret",
  video_path: "clients/c/canvases/cv/nodes/n/client-review/cut.mp4",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Dosa film",
};
const commentRow = {
  id: "c1", review_id: "r1", author_name: "Priya", body: "Logo too small",
  timecode_ms: 4000, edited_by_name: null, created_at: "t1", updated_at: "t1",
};

describe("GET /api/r/[token]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns title, video URL and comments — and no internal ids", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(listComments).mockResolvedValue([commentRow]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/r/${TOKEN}`), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Dosa film");
    expect(body.videoUrl).toBe(`https://cdn/${review.video_path}`);
    expect(body.comments).toHaveLength(1);
    const raw = JSON.stringify(body);
    for (const secret of ["org-secret", "cv-secret", "n-secret", "r1"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/r/${TOKEN}`), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(404);
  });
});
