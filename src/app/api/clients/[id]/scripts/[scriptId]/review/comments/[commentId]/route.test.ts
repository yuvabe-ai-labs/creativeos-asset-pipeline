// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/route.test.ts
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
  getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(), setThreadResolved: vi.fn(),
}));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, getScriptReviewForScript, hasApproval, setThreadResolved } from "@/lib/db/script-reviews";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const COMMENT_ID = "8c8c8c8c-0000-4000-8000-000000000008";
const params = (commentId = COMMENT_ID) => Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, commentId });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/comments/${COMMENT_ID}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script: Script = { id: SCRIPT_ID, clientId: "c1", stage: "in_review", doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" };
const review = { id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: "6f1c", created_by: "u1", created_at: "t" };

describe("PATCH …/comments/:commentId (resolve)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(getScript).mockResolvedValue(script);
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v1", number: 1, sharedAt: "t" });
    vi.mocked(hasApproval).mockResolvedValue(false);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
  });

  it("marks a thread Resolved under the team member's name", async () => {
    vi.mocked(setThreadResolved).mockResolvedValue(comment({ id: COMMENT_ID, resolvedAt: "t", resolvedByName: "Arun" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ resolved: true }), { params: params() });
    expect(res.status).toBe(200);
    expect(setThreadResolved).toHaveBeenCalledWith({ reviewId: "r1", commentId: COMMENT_ID, resolved: true, byName: "Arun" });
  });

  it("reopens a thread with no name", async () => {
    vi.mocked(setThreadResolved).mockResolvedValue(comment({ id: COMMENT_ID }));
    const { PATCH } = await import("./route");
    await PATCH(patch({ resolved: false }), { params: params() });
    expect(setThreadResolved).toHaveBeenCalledWith({ reviewId: "r1", commentId: COMMENT_ID, resolved: false, byName: null });
  });

  it("404s a reply's id (only a thread's first comment resolves) and a malformed id", async () => {
    vi.mocked(setThreadResolved).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ resolved: true }), { params: params() })).status).toBe(404);
    expect((await PATCH(patch({ resolved: true }), { params: params("not-a-uuid") })).status).toBe(404);
  });

  it("still lets the team resolve after the version on screen is approved", async () => {
    vi.mocked(hasApproval).mockResolvedValue(true);
    vi.mocked(setThreadResolved).mockResolvedValue(comment({ id: COMMENT_ID, resolvedAt: "t", resolvedByName: "Arun" }));
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ resolved: true }), { params: params() })).status).toBe(200);
    expect(setThreadResolved).toHaveBeenCalled();
  });
});
