import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1", platformRole: "member", orgId: "org-1", orgRole: "designer",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1", slug: "acme", name: "Acme" })),
}));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn() }));
vi.mock("@/lib/db/performance", () => ({
  getLatestSnapshot: vi.fn(),
  listFollowerSeries: vi.fn(),
  listTrackedPosts: vi.fn(),
}));

import { getBrandDetails } from "@/lib/db/brand-kit";
import { getLatestSnapshot, listFollowerSeries, listTrackedPosts } from "@/lib/db/performance";

const params = Promise.resolve({ id: "client-1" });
const req = () => new Request("http://test/api/clients/client-1/performance");

describe("GET /api/clients/[id]/performance", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null handle when brand_details has none", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({});
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(listFollowerSeries).mockResolvedValue([]);
    vi.mocked(listTrackedPosts).mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBeNull();
    expect(body.latest).toBeNull();
  });

  it("returns snapshot, series, posts, and computed stats", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(getLatestSnapshot).mockResolvedValue({
      id: "s1", client_id: "client-1", platform: "instagram", handle: "prakritisattva",
      followers_count: 144, follows_count: 62, posts_count: 57,
      captured_at: "2026-09-03T05:00:00.000Z",
    });
    vi.mocked(listFollowerSeries).mockResolvedValue([
      { captured_at: "2026-08-25T05:00:00.000Z", followers_count: 141 },
      { captured_at: "2026-09-03T05:00:00.000Z", followers_count: 144 },
    ]);
    vi.mocked(listTrackedPosts).mockResolvedValue([
      { id: "p1", client_id: "client-1", platform: "instagram", handle: "prakritisattva",
        short_code: "DDD", post_type: "image", caption: "Mela", post_url: "u",
        likes_count: 7, comments_count: 0, video_view_count: null,
        posted_at: "2026-03-11T10:00:00.000Z", thumbnail_url: null,
        first_seen_at: "t", last_seen_at: "t" },
    ] as never);
    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBe("prakritisattva");
    expect(body.latest.followersCount).toBe(144);
    expect(body.series).toHaveLength(2);
    expect(body.posts[0].short_code).toBe("DDD");
    expect(body.stats.medianLikes).toBe(7);
    expect(body.stats.followerDelta7d).toBe(3);
  });
});
