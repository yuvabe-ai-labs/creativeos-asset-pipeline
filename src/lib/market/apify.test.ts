import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { fetchProfileDetails, fetchPostMedia, fetchYouTubeDownload } from "./apify";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchProfileDetails", () => {
  type Reply = { status?: number; body: unknown };
  /** Answers each fetch with the next reply. */
  function scriptedFetch(replies: Reply[]) {
    const queue = [...replies];
    return vi.fn(async () => {
      const r = queue.shift() ?? { body: {} };
      const status = r.status ?? 200;
      return { ok: status < 300, status, json: async () => r.body };
    }) as unknown as typeof fetch;
  }
  const run = (status: string, usageTotalUsd?: number) => ({
    body: { data: { id: "run9", status, defaultDatasetId: "ds9", ...(usageTotalUsd !== undefined && { usageTotalUsd }) } },
  });
  const recordFor = { orgId: "org-1", clientId: "client-1" };
  const urls = (f: typeof fetch) => vi.mocked(f).mock.calls.map((c) => String(c[0]));

  beforeEach(() => vi.mocked(recordProviderCost).mockReset());

  it("starts an async run of the profile, polls until it succeeds, and returns the first item", async () => {
    const fetchImpl = scriptedFetch([
      run("READY"),
      run("RUNNING"),
      run("SUCCEEDED", 0.0042),
      { body: [{ username: "prakritisattva", followersCount: 144 }] },
    ]);
    const item = await fetchProfileDetails("prakritisattva", { token: "tok", fetchImpl, recordFor });
    expect(item?.username).toBe("prakritisattva");

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.apify.com/v2/acts/apify~instagram-scraper/runs?timeout=280");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.directUrls).toEqual(["https://www.instagram.com/prakritisattva/"]);
    expect(body.resultsType).toBe("details");
    expect(urls(fetchImpl)[1]).toContain("/actor-runs/run9?waitForFinish=");
    expect(urls(fetchImpl)[3]).toContain("/datasets/ds9/items");

    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(recordProviderCost).toHaveBeenCalledWith({
      ...recordFor,
      type: "scrape",
      modelId: "apify:actor",
      meters: { usd: 0.0042 },
      raw: { runId: "run9", actorId: "apify~instagram-scraper", usageTotalUsd: 0.0042 },
    });
  });

  it("returns null for an empty dataset", async () => {
    const fetchImpl = scriptedFetch([run("SUCCEEDED"), { body: [] }]);
    expect(await fetchProfileDetails("nobody", { token: "tok", fetchImpl })).toBeNull();
  });

  it("throws on an HTTP error", async () => {
    const fetchImpl = scriptedFetch([{ status: 402, body: { error: "quota" } }]);
    await expect(fetchProfileDetails("x", { token: "tok", fetchImpl })).rejects.toThrow(/402/);
  });

  it("fails as before when the run outlives the deadline, aborts it, and records nothing", async () => {
    const fetchImpl = scriptedFetch([run("RUNNING", 0.01), { body: {} }]);
    await expect(
      fetchProfileDetails("x", { token: "tok", fetchImpl, recordFor, deadlineMs: -1 }),
    ).rejects.toThrow("Apify request failed: HTTP 408");
    expect(urls(fetchImpl)[1]).toContain("/actor-runs/run9/abort");
    expect(recordProviderCost).not.toHaveBeenCalled();
  });

  it("records a failed run that Apify still billed, then throws", async () => {
    const fetchImpl = scriptedFetch([run("FAILED", 0.003)]);
    await expect(fetchProfileDetails("x", { token: "tok", fetchImpl, recordFor })).rejects.toThrow(
      /Apify request failed/,
    );
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({ meters: { usd: 0.003 } });
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
