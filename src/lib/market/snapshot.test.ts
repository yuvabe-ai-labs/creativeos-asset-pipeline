import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn() }));
vi.mock("@/lib/db/performance", () => ({
  insertAccountSnapshot: vi.fn(async () => ({ id: "snap-1" })),
  upsertTrackedPost: vi.fn(async () => ({ id: "post-1", thumbnail_url: null })),
  updateTrackedPostThumbnail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/market/apify", () => ({ fetchProfileDetails: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  uploadMarketThumbnail: vi.fn(async () => ({ url: "https://gcs/thumb.jpg" })),
}));

import { getBrandDetails } from "@/lib/db/brand-kit";
import { fetchProfileDetails } from "@/lib/market/apify";
import {
  insertAccountSnapshot,
  upsertTrackedPost,
  updateTrackedPostThumbnail,
} from "@/lib/db/performance";
import { uploadMarketThumbnail } from "@/lib/storage";
import { snapshotClientHandle } from "./snapshot";

const PROFILE = {
  username: "prakritisattva",
  followersCount: 144,
  followsCount: 62,
  postsCount: 57,
  latestPosts: [
    { shortCode: "AAA", type: "Image", url: "https://instagram.com/p/AAA/",
      likesCount: 7, commentsCount: 0, timestamp: "2026-03-11T10:00:00.000Z",
      displayUrl: "https://cdn.example/aaa.jpg" },
  ],
};

// Serves the thumbnail image fetch inside the orchestrator.
const imageFetch = vi.fn(async () => ({
  ok: true,
  headers: new Headers({ "content-type": "image/jpeg" }),
  arrayBuffer: async () => new ArrayBuffer(10),
})) as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APIFY_TOKEN = "test-token";
});

describe("snapshotClientHandle", () => {
  it("returns no-handle when brand_details has no parseable handle", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({});
    const r = await snapshotClientHandle("client-1");
    expect(r).toEqual({ ok: false, reason: "no-handle" });
    expect(vi.mocked(fetchProfileDetails)).not.toHaveBeenCalled();
  });

  it("returns no-data when the actor finds nothing", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(null);
    const r = await snapshotClientHandle("client-1");
    expect(r).toEqual({ ok: false, reason: "no-data" });
  });

  it("inserts a snapshot, upserts posts, re-hosts missing thumbnails", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(PROFILE as never);
    const r = await snapshotClientHandle("client-1", { fetchImpl: imageFetch });
    expect(r).toEqual({ ok: true, handle: "prakritisattva", postCount: 1 });
    expect(vi.mocked(insertAccountSnapshot)).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({ followersCount: 144 }),
    );
    expect(vi.mocked(upsertTrackedPost)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadMarketThumbnail)).toHaveBeenCalled();
    expect(vi.mocked(updateTrackedPostThumbnail)).toHaveBeenCalledWith("post-1", "https://gcs/thumb.jpg");
  });

  it("keeps the snapshot even when the thumbnail step throws", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(PROFILE as never);
    const failingFetch = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    const r = await snapshotClientHandle("client-1", { fetchImpl: failingFetch });
    expect(r).toEqual({ ok: true, handle: "prakritisattva", postCount: 1 });
    expect(vi.mocked(updateTrackedPostThumbnail)).not.toHaveBeenCalled();
  });

  it("skips re-hosting when the row already has a thumbnail", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(PROFILE as never);
    vi.mocked(upsertTrackedPost).mockResolvedValue({ id: "post-1", thumbnail_url: "https://gcs/old.jpg" } as never);
    await snapshotClientHandle("client-1", { fetchImpl: imageFetch });
    expect(vi.mocked(uploadMarketThumbnail)).not.toHaveBeenCalled();
  });
});
