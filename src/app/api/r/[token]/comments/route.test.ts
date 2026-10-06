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
import { getReviewByToken, insertComment } from "@/lib/db/client-reviews";
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

function post(body: unknown) {
  return new NextRequest(`http://localhost/api/r/${TOKEN}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ token: TOKEN });

describe("POST /api/r/[token]/comments", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stores the comment against the token's review and returns 201", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(insertComment).mockResolvedValue(commentRow);
    const { POST } = await import("./route");
    const res = await POST(post({ authorName: " Priya ", body: "Logo too small", timecodeMs: 4000 }), { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(insertComment)).toHaveBeenCalledWith({
      reviewId: "r1", authorName: "Priya", body: "Logo too small", timecodeMs: 4000,
    });
    expect((await res.json()).comment.authorName).toBe("Priya");
  });

  it("400s a whitespace-only comment without inserting", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const { POST } = await import("./route");
    const res = await POST(post({ authorName: "Priya", body: "   ", timecodeMs: 0 }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(insertComment)).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(post({ authorName: "P", body: "x", timecodeMs: 0 }), { params });
    expect(res.status).toBe(404);
  });
});
