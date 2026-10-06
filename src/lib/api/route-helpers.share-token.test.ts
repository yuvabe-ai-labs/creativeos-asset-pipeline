import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/client-reviews", () => ({ getReviewByToken: vi.fn() }));

import { getReviewByToken } from "@/lib/db/client-reviews";
import { withShareToken, apiOk } from "./route-helpers";

const TOKEN = "a".repeat(43);
const review = {
  id: "r1", canvas_id: "cv", node_id: "n", org_id: "o", video_path: "p",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Cut",
};

describe("withShareToken", () => {
  beforeEach(() => vi.resetAllMocks());

  it("404s a malformed token without touching the database", async () => {
    const res = await withShareToken(Promise.resolve({ token: "abc" }), async () => apiOk({}));
    expect(res.status).toBe(404);
    expect(vi.mocked(getReviewByToken)).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(null);
    const res = await withShareToken(Promise.resolve({ token: TOKEN }), async () => apiOk({}));
    expect(res.status).toBe(404);
  });

  it("hands the review to the handler", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const handler = vi.fn(async () => apiOk({ ok: true }));
    const res = await withShareToken(Promise.resolve({ token: TOKEN }), handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(review);
  });
});
