import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { fetchProfileDetails, fetchPostMedia, fetchYouTubeDownload } from "./apify";

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
/** A run that has already succeeded, then its dataset. */
const finished = (items: unknown[], usageTotalUsd?: number) => scriptedFetch([run("SUCCEEDED", usageTotalUsd), { body: items }]);
const recordFor = { orgId: "org-1", clientId: "client-1" };
const urls = (f: typeof fetch) => vi.mocked(f).mock.calls.map((c) => String(c[0]));

beforeEach(() => vi.mocked(recordProviderCost).mockReset());

describe("fetchProfileDetails", () => {
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

  it("fails as before when the run outlives the deadline, aborts it, and records what it cost", async () => {
    const fetchImpl = scriptedFetch([run("RUNNING", 0.01), run("ABORTING", 0.015)]);
    await expect(
      fetchProfileDetails("x", { token: "tok", fetchImpl, recordFor, deadlineMs: -1 }),
    ).rejects.toThrow("Apify request failed: HTTP 408");
    expect(urls(fetchImpl)[1]).toContain("/actor-runs/run9/abort");
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({ meters: { usd: 0.015 } });
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

  it("runs ONE permalink asynchronously and returns its video and cover still", async () => {
    const fetchImpl = scriptedFetch([
      run("READY"),
      run("SUCCEEDED"),
      {
        body: [
          {
            type: "Video",
            productType: "clips",
            videoUrl: "https://cdn/v.mp4",
            displayUrl: "https://cdn/d.jpg",
            videoDuration: 17.1,
          },
        ],
      },
    ]);
    const out = await fetchPostMedia(reel, { token: "tok", fetchImpl });
    expect(out).toEqual({ videoUrl: "https://cdn/v.mp4", displayUrl: "https://cdn/d.jpg" });

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.apify.com/v2/acts/apify~instagram-scraper/runs?timeout=280");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    // A post URL with resultsType "posts" — NOT the profile shape fetchProfileDetails
    // uses. Same actor, same token, different question.
    expect(body.directUrls).toEqual([reel]);
    expect(body.resultsType).toBe("posts");
    expect(body.resultsLimit).toBe(1);
    expect(urls(fetchImpl)[1]).toContain("/actor-runs/run9?waitForFinish=");
    expect(urls(fetchImpl)[2]).toContain("/datasets/ds9/items");
  });

  it("returns the still alone for a non-video post", async () => {
    const fetchImpl = finished([{ type: "Image", displayUrl: "https://cdn/d.jpg" }]);
    const out = await fetchPostMedia(reel, { token: "tok", fetchImpl });
    expect(out).toEqual({ videoUrl: undefined, displayUrl: "https://cdn/d.jpg" });
  });

  // Verified live: a dead permalink returns a ROW carrying `error`, not an empty
  // dataset. Treating that row as a post would archive nothing and report success.
  it("treats an error row as no data", async () => {
    const fetchImpl = finished([
      { url: "u", username: "reel", error: "not_found", errorDescription: "Post does not exist" },
    ]);
    expect(await fetchPostMedia(reel, { token: "tok", fetchImpl })).toBeNull();
  });

  it("returns null for an empty dataset", async () => {
    expect(await fetchPostMedia(reel, { token: "tok", fetchImpl: finished([]) })).toBeNull();
  });

  it("returns null when the row carries neither url", async () => {
    const fetchImpl = finished([{ type: "Video", videoDuration: 3 }]);
    expect(await fetchPostMedia(reel, { token: "tok", fetchImpl })).toBeNull();
  });

  it("throws on an HTTP error so the caller can record a reason", async () => {
    const fetchImpl = scriptedFetch([{ status: 402, body: { error: "quota" } }]);
    await expect(fetchPostMedia(reel, { token: "tok", fetchImpl })).rejects.toThrow("Apify request failed: HTTP 402");
  });

  describe("records what the run cost (D560)", () => {
    it("records the finished run once", async () => {
      const fetchImpl = finished([{ type: "Image", displayUrl: "https://cdn/d.jpg" }], 0.0023);
      await fetchPostMedia(reel, { token: "tok", fetchImpl, recordFor });
      expect(recordProviderCost).toHaveBeenCalledTimes(1);
      expect(recordProviderCost).toHaveBeenCalledWith({
        ...recordFor,
        type: "scrape",
        modelId: "apify:actor",
        meters: { usd: 0.0023 },
        raw: { runId: "run9", actorId: "apify~instagram-scraper", usageTotalUsd: 0.0023 },
      });
    });

    it("records a failed run that Apify still billed, then throws", async () => {
      const fetchImpl = scriptedFetch([run("FAILED", 0.002)]);
      await expect(fetchPostMedia(reel, { token: "tok", fetchImpl, recordFor })).rejects.toThrow(/Apify request failed/);
      expect(recordProviderCost).toHaveBeenCalledTimes(1);
    });

    it("fails as before when the run outlives the deadline, aborts it, and records what it cost", async () => {
      const fetchImpl = scriptedFetch([run("RUNNING", 0.01), { body: {} }]);
      await expect(
        fetchPostMedia(reel, { token: "tok", fetchImpl, recordFor, deadlineMs: -1 }),
      ).rejects.toThrow("Apify request failed: HTTP 408");
      expect(urls(fetchImpl)[1]).toContain("/actor-runs/run9/abort");
      expect(recordProviderCost).toHaveBeenCalledTimes(1);
      expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({ meters: { usd: 0.01 } });
    });

    it("records nothing when no one is named", async () => {
      await fetchPostMedia(reel, { token: "tok", fetchImpl: finished([], 0.002) });
      expect(recordProviderCost).not.toHaveBeenCalled();
    });
  });
});

describe("fetchYouTubeDownload", () => {
  const short = "https://www.youtube.com/shorts/8KuMqb6zxJc";

  it("returns downloadedFileUrl and ignores the HLS manifests", async () => {
    const fetchImpl = scriptedFetch([
      run("RUNNING"),
      run("SUCCEEDED"),
      {
        body: [
          {
            downloadedFileUrl: "https://api.apify.com/v2/key-value-stores/x/records/y.mp4",
            // Both of these are application/vnd.apple.mpegurl playlists, not files —
            // picking either would store a few hundred bytes of manifest as "the video".
            videoOnlyUrl: "https://manifest.googlevideo.com/api/manifest/hls_playlist/x",
            audioOnlyUrl: "https://manifest.googlevideo.com/api/manifest/hls_playlist/y",
            durationSeconds: 20,
          },
        ],
      },
    ]);
    const out = await fetchYouTubeDownload(short, { token: "tok", fetchImpl });
    expect(out).toBe("https://api.apify.com/v2/key-value-stores/x/records/y.mp4");

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.apify.com/v2/acts/streamers~youtube-video-downloader/runs?timeout=280");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.videos).toEqual([{ url: short }]);
    expect(body.preferredFormat).toBe("mp4");
    expect(urls(fetchImpl)[2]).toContain("/datasets/ds9/items");
  });

  it("returns null when the actor saved no row", async () => {
    expect(await fetchYouTubeDownload(short, { token: "tok", fetchImpl: finished([]) })).toBeNull();
  });

  it("returns null when the row has no downloadable file", async () => {
    const fetchImpl = finished([{ durationSeconds: 20, id: "x" }]);
    expect(await fetchYouTubeDownload(short, { token: "tok", fetchImpl })).toBeNull();
  });

  it("throws on an HTTP error", async () => {
    const fetchImpl = scriptedFetch([{ status: 500, body: {} }]);
    await expect(fetchYouTubeDownload(short, { token: "tok", fetchImpl })).rejects.toThrow("Apify request failed: HTTP 500");
  });

  describe("records what the run cost (D560)", () => {
    it("records the finished run once", async () => {
      const fetchImpl = finished([{ downloadedFileUrl: "https://kv/y.mp4" }], 0.05);
      await fetchYouTubeDownload(short, { token: "tok", fetchImpl, recordFor });
      expect(recordProviderCost).toHaveBeenCalledTimes(1);
      expect(recordProviderCost).toHaveBeenCalledWith({
        ...recordFor,
        type: "scrape",
        modelId: "apify:actor",
        meters: { usd: 0.05 },
        raw: { runId: "run9", actorId: "streamers~youtube-video-downloader", usageTotalUsd: 0.05 },
      });
    });

    it("records a failed run that Apify still billed, then throws", async () => {
      const fetchImpl = scriptedFetch([run("FAILED", 0.01)]);
      await expect(fetchYouTubeDownload(short, { token: "tok", fetchImpl, recordFor })).rejects.toThrow(/Apify request failed/);
      expect(recordProviderCost).toHaveBeenCalledTimes(1);
    });

    it("fails as before when the run outlives the deadline, aborts it, and records what it cost", async () => {
      const fetchImpl = scriptedFetch([run("RUNNING", 0.01), { body: {} }]);
      await expect(
        fetchYouTubeDownload(short, { token: "tok", fetchImpl, recordFor, deadlineMs: -1 }),
      ).rejects.toThrow("Apify request failed: HTTP 408");
      expect(urls(fetchImpl)[1]).toContain("/actor-runs/run9/abort");
      expect(recordProviderCost).toHaveBeenCalledTimes(1);
      expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({ meters: { usd: 0.01 } });
    });
  });
});
