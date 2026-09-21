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
vi.mock("@/lib/db/performance", () => ({
  isHandleTracked: vi.fn(),
  getLatestSnapshot: vi.fn(),
  listFollowerSeries: vi.fn(),
  listTrackedPosts: vi.fn(),
}));

import {
  isHandleTracked,
  getLatestSnapshot,
  listFollowerSeries,
  listTrackedPosts,
} from "@/lib/db/performance";

const params = Promise.resolve({ id: "client-1" });
const req = (query = "?handle=prakritisattva") =>
  new Request(`http://test/api/clients/client-1/performance${query}`);

const SNAPSHOT = {
  id: "s1", client_id: "client-1", platform: "instagram", handle: "prakritisattva",
  followers_count: 144, follows_count: 62, posts_count: 57,
  raw: {
    businessCategoryName: "Health/beauty",
    externalUrl: "https://prakritisattva.etsy.com",
    profilePicUrlHD: "https://cdn.example/avatar.jpg",
  },
  captured_at: "2026-09-03T05:00:00.000Z",
};

describe("GET /api/clients/[id]/performance", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires a handle", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("") as never, { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(getLatestSnapshot)).not.toHaveBeenCalled();
  });

  it("404s a handle this client does not track", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(false);
    const { GET } = await import("./route");
    const res = await GET(req("?handle=someoneelse") as never, { params });
    expect(res.status).toBe(404);
    expect(vi.mocked(getLatestSnapshot)).not.toHaveBeenCalled();
  });

  it("returns nulls for a tracked handle with no snapshot yet", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(listFollowerSeries).mockResolvedValue([]);
    vi.mocked(listTrackedPosts).mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBe("prakritisattva");
    expect(body.latest).toBeNull();
    expect(body.identity).toBeNull();
  });

  it("returns snapshot, identity, series, posts and computed stats", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue(SNAPSHOT);
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
    expect(body.identity.category).toBe("Health/beauty");
    expect(body.identity.avatarUrl).toBe("https://cdn.example/avatar.jpg");
    expect(body.series).toHaveLength(2);
    expect(body.posts[0].short_code).toBe("DDD");
    expect(body.stats.medianLikes).toBe(7);
    expect(body.stats.followerDelta7d).toBe(3);
  });

  it("reads only the requested handle", async () => {
    vi.mocked(isHandleTracked).mockResolvedValue(true);
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(listFollowerSeries).mockResolvedValue([]);
    vi.mocked(listTrackedPosts).mockResolvedValue([]);
    const { GET } = await import("./route");
    await GET(req("?handle=%40PrakritiSattva") as never, { params });
    // Canonicalized before it reaches the DB, so a link carrying "@Foo" hits the
    // same rows as one carrying "foo".
    expect(vi.mocked(listTrackedPosts)).toHaveBeenCalledWith("client-1", "prakritisattva");
  });
});
