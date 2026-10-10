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
import { getReviewByToken, updateComment } from "@/lib/db/client-reviews";
const TOKEN = "a".repeat(43);
const COMMENT_ID = "3f2b8c1e-9a4d-4e7f-b1c2-0d9e8f7a6b5c";
const review = {
  id: "r1", canvas_id: "cv-secret", node_id: "n-secret", org_id: "org-secret",
  video_path: "clients/c/canvases/cv/nodes/n/client-review/cut.mp4",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Dosa film",
};
const commentRow = {
  id: COMMENT_ID, review_id: "r1", author_name: "Priya", body: "Logo too small",
  timecode_ms: 4000, edited_by_name: null, created_at: "t1", updated_at: "t1",
};

function patch(body: unknown) {
  return new NextRequest(`http://localhost/api/r/${TOKEN}/comments/${COMMENT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ token: TOKEN, commentId: COMMENT_ID });

describe("PATCH /api/r/[token]/comments/[commentId]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("edits the body only and records who edited", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(updateComment).mockResolvedValue({ ...commentRow, body: "Warmer", edited_by_name: "Arjun" });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "Warmer", timecodeMs: 1, authorName: "X" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateComment)).toHaveBeenCalledWith({
      reviewId: "r1", commentId: COMMENT_ID, body: "Warmer", editedByName: "Arjun",
    });
    expect((await res.json()).comment.editedByName).toBe("Arjun");
  });

  it("404s a comment that belongs to a different review", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(updateComment).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "Warmer" }), { params });
    expect(res.status).toBe(404);
  });

  it("400s clearing a comment to empty", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "  " }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(updateComment)).not.toHaveBeenCalled();
  });

  it("404s a non-uuid comment id before touching the database", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "Warmer" }), {
      params: Promise.resolve({ token: TOKEN, commentId: "c1" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Comment not found.");
    expect(vi.mocked(updateComment)).not.toHaveBeenCalled();
  });

  it("500s a database failure without leaking its message", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(updateComment).mockRejectedValue(new Error("pg secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "Warmer" }), { params });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("pg secret detail");
  });
});
