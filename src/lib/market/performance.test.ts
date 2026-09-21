import { describe, it, expect } from "vitest";
import {
  parseInstagramHandle,
  normalizeProfileItem,
  computeStats,
  postMultiplier,
  extractIdentity,
  type ApifyProfileItem,
} from "./performance";

const FIXTURE: ApifyProfileItem = {
  username: "prakritisattva",
  fullName: "Prakriti Sattva - The Essence of Nature",
  biography: "Holistic health/Natural beauty",
  externalUrl: "https://prakritisattva.etsy.com",
  businessCategoryName: "Health/beauty",
  followersCount: 144,
  followsCount: 62,
  postsCount: 57,
  profilePicUrlHD: "https://cdn.example/avatar.jpg",
  latestPosts: [
    { shortCode: "AAA", type: "Video", caption: "Honor the work your body does",
      url: "https://www.instagram.com/p/AAA/", likesCount: 1, commentsCount: 0,
      videoViewCount: 9, timestamp: "2026-08-28T10:00:00.000Z",
      displayUrl: "https://cdn.example/aaa.jpg" },
    { shortCode: "BBB", type: "Sidecar", caption: "Elevate your hair care ritual",
      url: "https://www.instagram.com/p/BBB/", likesCount: 3, commentsCount: 0,
      timestamp: "2026-06-18T10:00:00.000Z", displayUrl: "https://cdn.example/bbb.jpg" },
    { shortCode: "CCC", type: "Image", caption: "Honor Her Nature",
      url: "https://www.instagram.com/p/CCC/", likesCount: -1, commentsCount: 0,
      timestamp: "2026-04-28T10:00:00.000Z", displayUrl: "https://cdn.example/ccc.jpg" },
    { shortCode: "DDD", type: "Image", caption: "CAAM Ayurveda Mela",
      url: "https://www.instagram.com/p/DDD/", likesCount: 7, commentsCount: 0,
      timestamp: "2026-03-11T10:00:00.000Z", displayUrl: "https://cdn.example/ddd.jpg" },
  ],
};

describe("parseInstagramHandle", () => {
  it("strips @ and whitespace", () => {
    expect(parseInstagramHandle(" @PrakritiSattva ")).toBe("prakritisattva");
  });
  it("extracts the handle from a profile URL", () => {
    expect(parseInstagramHandle("https://www.instagram.com/prakritisattva/")).toBe("prakritisattva");
  });
  it("extracts from a URL with query junk", () => {
    expect(parseInstagramHandle("https://instagram.com/prakritisattva?igsh=abc")).toBe("prakritisattva");
  });
  it("returns null for empty, absent, or invalid input", () => {
    expect(parseInstagramHandle(undefined)).toBeNull();
    expect(parseInstagramHandle("")).toBeNull();
    expect(parseInstagramHandle("not a handle!!")).toBeNull();
    expect(parseInstagramHandle("https://instagram.com/")).toBeNull();
  });
});

describe("normalizeProfileItem", () => {
  const { snapshot, posts } = normalizeProfileItem(FIXTURE);
  it("maps account counts and keeps raw", () => {
    expect(snapshot.handle).toBe("prakritisattva");
    expect(snapshot.followersCount).toBe(144);
    expect(snapshot.followsCount).toBe(62);
    expect(snapshot.postsCount).toBe(57);
    expect(snapshot.raw).toBe(FIXTURE);
  });
  it("converts the -1 hidden-likes sentinel to null", () => {
    expect(posts.find((p) => p.shortCode === "CCC")?.likesCount).toBeNull();
  });
  it("maps provider types to image/video/carousel", () => {
    expect(posts.find((p) => p.shortCode === "AAA")?.postType).toBe("video");
    expect(posts.find((p) => p.shortCode === "BBB")?.postType).toBe("carousel");
    expect(posts.find((p) => p.shortCode === "DDD")?.postType).toBe("image");
  });
  it("keeps video views only for videos", () => {
    expect(posts.find((p) => p.shortCode === "AAA")?.videoViewCount).toBe(9);
    expect(posts.find((p) => p.shortCode === "DDD")?.videoViewCount).toBeNull();
  });
});

describe("computeStats", () => {
  const posts = [
    { likesCount: 1, commentsCount: 0, postedAt: "2026-08-28T10:00:00.000Z" },
    { likesCount: 3, commentsCount: 0, postedAt: "2026-06-18T10:00:00.000Z" },
    { likesCount: null, commentsCount: 0, postedAt: "2026-04-28T10:00:00.000Z" }, // hidden — excluded
    { likesCount: 7, commentsCount: 0, postedAt: "2026-03-11T10:00:00.000Z" },
  ];
  it("computes median likes excluding hidden and engagement rate", () => {
    const s = computeStats({ posts, followers: 144, series: [] });
    expect(s.medianLikes).toBe(3); // median of [1,3,7]
    expect(s.engagementRate).toBeCloseTo(3 / 144, 5); // median comments = 0
  });
  it("computes cadence from the posted_at spread", () => {
    const s = computeStats({ posts, followers: 144, series: [] });
    // 4 posts over ~170 days ≈ 0.7/mo
    expect(s.cadencePerMonth).toBeGreaterThan(0.5);
    expect(s.cadencePerMonth).toBeLessThan(1.0);
  });
  it("computes follower delta from a snapshot ≥7d older, else null", () => {
    const now = new Date("2026-09-03T09:00:00.000Z").toISOString();
    const old = new Date("2026-08-25T09:00:00.000Z").toISOString();
    const s = computeStats({
      posts: [], followers: 144,
      series: [{ capturedAt: old, followers: 141 }, { capturedAt: now, followers: 144 }],
    });
    expect(s.followerDelta7d).toBe(3);
    const s2 = computeStats({ posts: [], followers: 144, series: [{ capturedAt: now, followers: 144 }] });
    expect(s2.followerDelta7d).toBeNull();
  });
  it("returns nulls when there is nothing to compute from", () => {
    const s = computeStats({ posts: [], followers: null, series: [] });
    expect(s).toEqual({ engagementRate: null, medianLikes: null, cadencePerMonth: null, followerDelta7d: null });
  });
});

describe("extractIdentity", () => {
  it("pulls category, external url and avatar out of a raw payload", () => {
    expect(extractIdentity(FIXTURE)).toEqual({
      category: "Health/beauty",
      externalUrl: "https://prakritisattva.etsy.com",
      avatarUrl: "https://cdn.example/avatar.jpg",
    });
  });
  it("returns nulls for a payload missing those fields", () => {
    expect(extractIdentity({ username: "x", followersCount: 1 })).toEqual({
      category: null,
      externalUrl: null,
      avatarUrl: null,
    });
  });
  it("returns null for a non-object raw", () => {
    expect(extractIdentity(null)).toBeNull();
    expect(extractIdentity(undefined)).toBeNull();
    expect(extractIdentity("nope")).toBeNull();
  });
  it("ignores non-string values rather than trusting the shape", () => {
    // raw is provider data of unknown vintage — a number where a string belongs
    // must not reach the identity strip as a rendered value.
    expect(extractIdentity({ businessCategoryName: 42, externalUrl: [], profilePicUrlHD: null })).toEqual({
      category: null,
      externalUrl: null,
      avatarUrl: null,
    });
  });
});

describe("postMultiplier", () => {
  it("is likes / median", () => expect(postMultiplier(7, 2)).toBe(3.5));
  it("null when likes hidden or median unusable", () => {
    expect(postMultiplier(null, 2)).toBeNull();
    expect(postMultiplier(7, null)).toBeNull();
    expect(postMultiplier(7, 0)).toBeNull();
  });
});
