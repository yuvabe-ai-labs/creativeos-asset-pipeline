// src/app/api/r/s/[token]/comments/[commentId]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { comment, content } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewByToken: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(), updateClientComment: vi.fn(),
}));

import { getLatestVersion, getScriptReviewByToken, hasApproval, updateClientComment } from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const COMMENT_ID = "8c8c8c8c-0000-4000-8000-000000000008";
const params = (commentId = COMMENT_ID) => Promise.resolve({ token: TOKEN, commentId });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/r/s/${TOKEN}/comments/${COMMENT_ID}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const review = {
  id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};

describe("PATCH /api/r/s/[token]/comments/[commentId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v1", number: 1, sharedAt: "t" });
    vi.mocked(hasApproval).mockResolvedValue(false);
  });

  it("edits a client comment's text and records who", async () => {
    vi.mocked(updateClientComment).mockResolvedValue(comment({ id: COMMENT_ID, body: "Blue, please", editedByName: "Ravi" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Ravi", body: "Blue, please" }), { params: params() });
    expect(res.status).toBe(200);
    expect(updateClientComment).toHaveBeenCalledWith({ reviewId: "r1", commentId: COMMENT_ID, body: "Blue, please", editedByName: "Ravi" });
  });

  it("404s a team reply's id (not editable from the link) and a malformed id", async () => {
    vi.mocked(updateClientComment).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ editorName: "Ravi", body: "x" }), { params: params() })).status).toBe(404);
    expect((await PATCH(patch({ editorName: "Ravi", body: "x" }), { params: params("nope") })).status).toBe(404);
  });

  it("409s once the version is approved", async () => {
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ editorName: "Ravi", body: "x" }), { params: params() })).status).toBe(409);
    expect(updateClientComment).not.toHaveBeenCalled();
  });
});
