// src/app/api/r/s/[token]/comments/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { avatarSnapshot, comment, content } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewByToken: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(),
  countScriptComments: vi.fn(), insertScriptComment: vi.fn(),
}));

import {
  countScriptComments, getLatestVersion, getScriptReviewByToken, hasApproval, insertScriptComment,
} from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const params = Promise.resolve({ token: TOKEN });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/r/s/${TOKEN}/comments`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const review = {
  id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};
const latest = { ...content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: {} } }), id: "v2", number: 2, sharedAt: "t" };
const good = { authorName: "Priya", body: "Can she wear blue?", part: { kind: "cast", castId: "meenakshi" }, versionNumber: 2 };

describe("POST /api/r/s/[token]/comments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue(latest);
    vi.mocked(hasApproval).mockResolvedValue(false);
    vi.mocked(countScriptComments).mockResolvedValue(0);
  });

  it("stores the comment on the version on screen, as the client", async () => {
    vi.mocked(insertScriptComment).mockResolvedValue(comment({ part: good.part as never }));
    const { POST } = await import("./route");
    const res = await POST(post(good), { params });
    expect(res.status).toBe(201);
    expect(insertScriptComment).toHaveBeenCalledWith({
      reviewId: "r1", versionId: "v2", part: { kind: "cast", castId: "meenakshi" }, parentId: null,
      authorKind: "client", authorName: "Priya", authorUserId: null, body: "Can she wear blue?",
    });
  });

  it("refuses a stale tab (Review Focus 1)", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ ...good, versionNumber: 1 }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("A newer version was shared. Reload to see it.");
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  // A view is refused even though this version shows its image: the avatar takes comments whole (D359).
  it("refuses a part the version does not show (Review Focus 3)", async () => {
    const { POST } = await import("./route");
    for (const part of [
      { kind: "shot", shotId: "s99" },
      { kind: "view", castId: "meenakshi", view: "front" },
      { kind: "panel", shotId: "s01" },
    ]) {
      const res = await POST(post({ ...good, part }), { params });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("That part is not in this version.");
    }
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  it("takes no comments once the version is approved", async () => {
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(post(good), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This reel is approved. The link is now a record and takes no more comments.");
  });

  it("409s at the comment limit", async () => {
    vi.mocked(countScriptComments).mockResolvedValue(500);
    const { POST } = await import("./route");
    expect((await POST(post(good), { params })).status).toBe(409);
  });

  it("500s a database failure without leaking its message", async () => {
    vi.mocked(insertScriptComment).mockRejectedValue(new Error("duplicate key value violates constraint"));
    const { POST } = await import("./route");
    const res = await POST(post(good), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Could not post the comment.");
  });
});
