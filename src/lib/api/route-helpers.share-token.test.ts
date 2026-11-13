import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/client-reviews", () => ({ getReviewVersionByLink: vi.fn() }));

import { getReviewVersionByLink } from "@/lib/db/client-reviews";
import { withShareToken, apiOk } from "./route-helpers";

const TOKEN = "a".repeat(43);
const review = {
  id: "r1", canvas_id: "cv", node_id: "n", org_id: "o",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Cut",
};
const version = {
  id: "v1", review_id: "r1", version_no: 1, title: null, video_path: "p", allow_download: true,
  legacy_link: true, created_by: "u", created_at: "t",
};
const found = { review, version };

describe("withShareToken", () => {
  beforeEach(() => vi.resetAllMocks());

  it("404s a malformed token without touching the database", async () => {
    const res = await withShareToken(Promise.resolve({ token: "abc" }), async () => apiOk({}));
    expect(res.status).toBe(404);
    expect(vi.mocked(getReviewVersionByLink)).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue(null);
    const res = await withShareToken(Promise.resolve({ token: TOKEN }), async () => apiOk({}));
    expect(res.status).toBe(404);
  });

  it("looks a titled link up by its code alone (D311), in any case", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue(found);
    const res = await withShareToken(Promise.resolve({ token: "Dosa-Film-B4B4" }), async () => apiOk({}));
    expect(res.status).toBe(200);
    expect(vi.mocked(getReviewVersionByLink)).toHaveBeenCalledWith("b4b4", 1);
  });

  it("looks up the version the link names (D496)", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue({ review, version: { ...version, version_no: 3 } });
    const res = await withShareToken(Promise.resolve({ token: "dosa-film-b4b4-v3" }), async () => apiOk({}));
    expect(res.status).toBe(200);
    expect(vi.mocked(getReviewVersionByLink)).toHaveBeenCalledWith("b4b4", 3);
  });

  it("404s a version that doesn't exist", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue(null);
    const res = await withShareToken(Promise.resolve({ token: "dosa-film-b4b4-v9" }), async () => apiOk({}));
    expect(res.status).toBe(404);
  });

  it("hands the review and its version to the handler", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue(found);
    const handler = vi.fn(async () => apiOk({ ok: true }));
    const res = await withShareToken(Promise.resolve({ token: TOKEN }), handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(review, version);
  });
});
