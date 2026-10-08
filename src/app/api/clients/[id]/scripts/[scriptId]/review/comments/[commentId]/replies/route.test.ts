// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { comment, content, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(),
  getCommentForReply: vi.fn(), countScriptComments: vi.fn(), insertScriptComment: vi.fn(),
}));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import {
  countScriptComments, getCommentForReply, getLatestVersion, getScriptReviewForScript, hasApproval, insertScriptComment,
} from "@/lib/db/script-reviews";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const COMMENT_ID = "8c8c8c8c-0000-4000-8000-000000000008";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, commentId: COMMENT_ID });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/comments/${COMMENT_ID}/replies`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script: Script = { id: SCRIPT_ID, clientId: "c1", stage: "in_review", doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" };
const review = { id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: "6f1c", created_by: "u1", created_at: "t" };
const parent = { id: COMMENT_ID, versionId: "v1", part: { kind: "shot" as const, shotId: "s04" }, parentId: null };

describe("POST …/comments/:commentId/replies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(getScript).mockResolvedValue(script);
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v2", number: 2, sharedAt: "t" });
    vi.mocked(hasApproval).mockResolvedValue(false);
    vi.mocked(countScriptComments).mockResolvedValue(3);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
  });

  it("replies on the thread's own version and part, as the team", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue(parent);
    vi.mocked(insertScriptComment).mockResolvedValue(comment({ id: "r9", parentId: COMMENT_ID, authorKind: "team", authorName: "Arun" }));
    const { POST } = await import("./route");
    const res = await POST(post({ body: "Blue works" }), { params });
    expect(res.status).toBe(201);
    expect(insertScriptComment).toHaveBeenCalledWith({
      reviewId: "r1", versionId: "v1", part: { kind: "shot", shotId: "s04" }, parentId: COMMENT_ID,
      authorKind: "team", authorName: "Arun", authorUserId: "u1", body: "Blue works",
    });
  });

  it("refuses a reply to a reply", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue({ ...parent, parentId: "another" });
    const { POST } = await import("./route");
    expect((await POST(post({ body: "x" }), { params })).status).toBe(400);
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  it("still lets the team reply after the version on screen is approved", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue(parent);
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { POST } = await import("./route");
    expect((await POST(post({ body: "Noted for the edit." }), { params })).status).toBe(201);
    expect(insertScriptComment).toHaveBeenCalled();
  });

  it("404s a comment this script's review does not have", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post({ body: "x" }), { params })).status).toBe(404);
  });
});
