import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/storage", () => ({ signCutDownloadUrl: vi.fn() }));
vi.mock("@/lib/db/client-reviews", () => ({ getReviewVersionByLink: vi.fn() }));
import { getReviewVersionByLink } from "@/lib/db/client-reviews";
import { signCutDownloadUrl } from "@/lib/storage";
import { GET } from "./route";

const TOKEN = "a".repeat(43);
const review = {
  id: "r1", canvas_id: "cv", node_id: "n", org_id: "org",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Dosa film",
};
const version = {
  id: "v1", review_id: "r1", version_no: 1, title: null, allow_download: true, legacy_link: true,
  video_path: "clients/c/canvases/cv/nodes/n/client-review/cut__x.mov",
  created_by: "u", created_at: "t",
};
const get = (token: string) =>
  GET(new NextRequest(`http://localhost/api/r/${token}/download`), { params: Promise.resolve({ token }) });

describe("GET /api/r/[token]/download (D478)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("redirects to a signed URL named after the review, and is never cached", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue({ review, version });
    vi.mocked(signCutDownloadUrl).mockResolvedValue("https://signed.example/cut");
    const res = await get(TOKEN);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://signed.example/cut");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(signCutDownloadUrl).toHaveBeenCalledWith(version.video_path, "dosa-film.mov");
  });

  it("404s a version with Allow download off, without signing anything (D497)", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue({ review, version: { ...version, allow_download: false } });
    const res = await get(`${TOKEN}-v1`);
    expect(res.status).toBe(404);
    expect(signCutDownloadUrl).not.toHaveBeenCalled();
  });

  it("404s an unknown token without signing anything", async () => {
    vi.mocked(getReviewVersionByLink).mockResolvedValue(null);
    const res = await get(TOKEN);
    expect(res.status).toBe(404);
    expect(signCutDownloadUrl).not.toHaveBeenCalled();
  });
});
