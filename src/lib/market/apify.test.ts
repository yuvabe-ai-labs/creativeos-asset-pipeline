import { describe, it, expect, vi } from "vitest";
import { fetchProfileDetails, fetchPostMedia, fetchYouTubeDownload } from "./apify";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchProfileDetails", () => {
  it("POSTs the profile URL to the sync dataset endpoint with a bearer token", async () => {
    const fetchImpl = mockFetch(201, [{ username: "prakritisattva", followersCount: 144 }]);
    const item = await fetchProfileDetails("prakritisattva", { token: "tok", fetchImpl });
    expect(item?.username).toBe("prakritisattva");
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("apify~instagram-scraper/run-sync-get-dataset-items");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.directUrls).toEqual(["https://www.instagram.com/prakritisattva/"]);
    expect(body.resultsType).toBe("details");
  });
  it("returns null for an empty dataset", async () => {
    const item = await fetchProfileDetails("nobody", { token: "tok", fetchImpl: mockFetch(201, []) });
    expect(item).toBeNull();
  });
  it("throws on an HTTP error", async () => {
    await expect(
      fetchProfileDetails("x", { token: "tok", fetchImpl: mockFetch(402, { error: "quota" }) }),
    ).rejects.toThrow(/402/);
  });
});

describe("fetchPostMedia", () => {
  const reel = "https://www.instagram.com/reel/DZF-BbBxWJl/";

  it("posts ONE permalink and returns its video and cover still", async () => {
    const fetchImpl = mockFetch(201, [
      {
        type: "Video",
        productType: "clips",
        videoUrl: "https://cdn/v.mp4",
        displayUrl: "https://cdn/d.jpg",
        videoDuration: 17.1,
      },
    ]);
    const out = await fetchPostMedia(reel, { token: "tok", fetchImpl });
    expect(out).toEqual({ videoUrl: "https://cdn/v.mp4", displayUrl: "https://cdn/d.jpg" });

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("apify~instagram-scraper/run-sync-get-dataset-items");
    const body = JSON.parse(init.body as string);
    // A post URL with resultsType "posts" — NOT the profile shape fetchProfileDetails
    // uses. Same actor, same token, different question.
    expect(body.directUrls).toEqual([reel]);
    expect(body.resultsType).toBe("posts");
    expect(body.resultsLimit).toBe(1);
  });

  it("returns the still alone for a non-video post", async () => {
    const fetchImpl = mockFetch(201, [{ type: "Image", displayUrl: "https://cdn/d.jpg" }]);
    const out = await fetchPostMedia(reel, { token: "tok", fetchImpl });
    expect(out).toEqual({ videoUrl: undefined, displayUrl: "https://cdn/d.jpg" });
  });

  // Verified live: a dead permalink returns a ROW carrying `error`, not an empty
  // dataset. Treating that row as a post would archive nothing and report success.
  it("treats an error row as no data", async () => {
    const fetchImpl = mockFetch(201, [
      { url: "u", username: "reel", error: "not_found", errorDescription: "Post does not exist" },
    ]);
    expect(await fetchPostMedia(reel, { token: "tok", fetchImpl })).toBeNull();
  });

  it("returns null for an empty dataset", async () => {
    expect(await fetchPostMedia(reel, { token: "tok", fetchImpl: mockFetch(201, []) })).toBeNull();
  });

  it("returns null when the row carries neither url", async () => {
    const fetchImpl = mockFetch(201, [{ type: "Video", videoDuration: 3 }]);
    expect(await fetchPostMedia(reel, { token: "tok", fetchImpl })).toBeNull();
  });

  it("throws on an HTTP error so the caller can record a reason", async () => {
    await expect(
      fetchPostMedia(reel, { token: "tok", fetchImpl: mockFetch(402, { error: "quota" }) }),
    ).rejects.toThrow(/402/);
  });
});

describe("fetchYouTubeDownload", () => {
  const short = "https://www.youtube.com/shorts/8KuMqb6zxJc";

  it("returns downloadedFileUrl and ignores the HLS manifests", async () => {
    const fetchImpl = mockFetch(201, [
      {
        downloadedFileUrl: "https://api.apify.com/v2/key-value-stores/x/records/y.mp4",
        // Both of these are application/vnd.apple.mpegurl playlists, not files —
        // picking either would store a few hundred bytes of manifest as "the video".
        videoOnlyUrl: "https://manifest.googlevideo.com/api/manifest/hls_playlist/x",
        audioOnlyUrl: "https://manifest.googlevideo.com/api/manifest/hls_playlist/y",
        durationSeconds: 20,
      },
    ]);
    const out = await fetchYouTubeDownload(short, { token: "tok", fetchImpl });
    expect(out).toBe("https://api.apify.com/v2/key-value-stores/x/records/y.mp4");

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("streamers~youtube-video-downloader/run-sync-get-dataset-items");
    const body = JSON.parse(init.body as string);
    expect(body.videos).toEqual([{ url: short }]);
    expect(body.preferredFormat).toBe("mp4");
  });

  it("returns null when the actor saved no row", async () => {
    expect(
      await fetchYouTubeDownload(short, { token: "tok", fetchImpl: mockFetch(201, []) }),
    ).toBeNull();
  });

  it("returns null when the row has no downloadable file", async () => {
    const fetchImpl = mockFetch(201, [{ durationSeconds: 20, id: "x" }]);
    expect(await fetchYouTubeDownload(short, { token: "tok", fetchImpl })).toBeNull();
  });

  it("throws on an HTTP error", async () => {
    await expect(
      fetchYouTubeDownload(short, { token: "tok", fetchImpl: mockFetch(500, {}) }),
    ).rejects.toThrow(/500/);
  });
});
