import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// A small video limit, so a test can send a "too large" video in a few bytes.
vi.mock("./constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./constants")>()),
  IMPORT_VIDEO_SIZE_LIMIT: 10,
}));
vi.mock("@/lib/jobs/db", () => ({
  getJob: vi.fn(),
  listRecentJobs: vi.fn(async () => []),
  startJob: vi.fn(),
  setJobPhase: vi.fn(),
  succeedJob: vi.fn(),
  failJob: vi.fn(),
  saveJobCheckpoint: vi.fn(),
}));
vi.mock("@/lib/db/kb", () => ({
  latestImportedPostAt: vi.fn(async () => null),
  listBrandImageRefs: vi.fn(),
  insertImportedBrandImage: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  removeObject: vi.fn(async () => undefined),
  uploadImportedBrandMedia: vi.fn(async (a: { imageId: string; filename: string }) => ({
    url: `https://gcs/${a.imageId}/${a.filename}`,
    path: "p",
  })),
  // Reads the stream to its end, as storage would, so its byte count and limit apply.
  uploadImportedBrandMediaStream: vi.fn(async (a: { imageId: string; filename: string; body: AsyncIterable<unknown> }) => {
    for await (const chunk of a.body) void chunk;
    return { url: `https://gcs/${a.imageId}/${a.filename}`, path: "p" };
  }),
}));
vi.mock("./apify", () => ({ runImportActor: vi.fn() }));
// sharp decodes real images; these tests only care that a preview is made and stored.
vi.mock("sharp", () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    webp: () => chain,
    toBuffer: async () => Buffer.from("webp"),
    // EXIF orientation 6 = rotated a quarter turn: stored 1350×1080 shows as 1080×1350.
    metadata: async () => ({ width: 1350, height: 1080, orientation: 6 }),
  };
  return { default: Object.assign(vi.fn(() => chain), { cache: vi.fn(), concurrency: vi.fn() }) };
});

import { failJob, getJob, listRecentJobs, saveJobCheckpoint, setJobPhase, succeedJob } from "@/lib/jobs/db";
import { insertImportedBrandImage, latestImportedPostAt, listBrandImageRefs } from "@/lib/db/kb";
import { removeObject, uploadImportedBrandMedia, uploadImportedBrandMediaStream } from "@/lib/storage";
import { runImportActor } from "./apify";
import { runAssetImport } from "./run";

const job = (source: string) => ({
  id: "job-1",
  client_id: "client-1",
  input: { source, target: "https://www.instagram.com/brand/" },
});

const CDN = "https://cdn.fbcdn.net/v/t51/";
const post = (n: number, extra: Record<string, unknown> = {}) => ({
  url: `https://www.instagram.com/p/${n}/`,
  timestamp: new Date().toISOString(),
  displayUrl: `${CDN}${n}00_${n}11_${n}22_n.jpg`,
  ...extra,
});

/** Answers every download with bytes of the given type. */
function mediaFetch(contentType = "image/jpeg", status = 200) {
  return vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status, headers: { "content-type": contentType } })) as unknown as typeof fetch;
}

/** Answers each download by its URL: the media type, the bytes, and any extra headers. */
function fetchByUrl(answer: (url: string) => { contentType: string; bytes: number; headers?: Record<string, string> }) {
  return vi.fn(async (url: string) => {
    const a = answer(url);
    return new Response(new Uint8Array(a.bytes).fill(7), { headers: { "content-type": a.contentType, ...a.headers } });
  }) as unknown as typeof fetch;
}

describe("runAssetImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APIFY_TOKEN = "tok";
    vi.mocked(listBrandImageRefs).mockResolvedValue(new Set());
    vi.mocked(insertImportedBrandImage).mockImplementation(async (r) => ({ id: r.id }) as never);
    // No history and nothing kept: a full fetch, unless a test says otherwise.
    vi.mocked(listRecentJobs).mockResolvedValue([]);
    vi.mocked(latestImportedPostAt).mockResolvedValue(null);
  });

  it("downloads, stores and records each new asset, then succeeds with the count", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1), post(2)]);
    const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(result).toEqual({ assetCount: 2, found: 2, failed: 0, since: null });
    const row = vi.mocked(insertImportedBrandImage).mock.calls[0][0];
    expect(row).toMatchObject({ clientId: "client-1", source: "instagram", mediaType: "image", fileExt: "jpg" });
    expect(row.sourceRef).toMatch(/^meta:/);
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "2 new");
  });

  it("narrows a refresh to posts after the newest one already kept", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    const day = 24 * 60 * 60 * 1000;
    const newestKept = new Date(Date.now() - 5 * day);
    vi.mocked(latestImportedPostAt).mockResolvedValue(newestKept.toISOString());
    vi.mocked(runImportActor).mockResolvedValue([]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    // A day of overlap before the newest kept post.
    expect(vi.mocked(runImportActor).mock.calls[0][2].since).toBe(new Date(newestKept.getTime() - day).toISOString().slice(0, 10));
  });

  it("fetches the whole window when nothing from the source is kept yet", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    // A recent run "succeeded" with no new posts — but nothing was ever kept (Jackfruit365).
    vi.mocked(listRecentJobs).mockResolvedValue([
      { id: "old", status: "succeeded", created_at: new Date().toISOString(), input: { source: "instagram", target: "https://www.instagram.com/brand/" }, result: { assetCount: 0, found: 0, failed: 0 } },
    ] as never);
    vi.mocked(latestImportedPostAt).mockResolvedValue(null);
    vi.mocked(runImportActor).mockResolvedValue([]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(vi.mocked(runImportActor).mock.calls[0][2].since).toBeNull();
  });

  it("starts over when the handle changed since the last good run", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(listRecentJobs).mockResolvedValue([
      { id: "old", status: "succeeded", created_at: new Date().toISOString(), input: { source: "instagram", target: "https://www.instagram.com/other/" }, result: { assetCount: 4, found: 4, failed: 0 } },
    ] as never);
    vi.mocked(latestImportedPostAt).mockResolvedValue(new Date().toISOString());
    vi.mocked(runImportActor).mockResolvedValue([]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(vi.mocked(runImportActor).mock.calls[0][2].since).toBeNull();
  });

  it("crawls a website whole, whatever came before", async () => {
    vi.mocked(getJob).mockResolvedValue(job("website") as never);
    vi.mocked(listRecentJobs).mockResolvedValue([
      { id: "old", status: "succeeded", created_at: "2026-10-03T10:00:00Z", input: { source: "website", target: "https://www.instagram.com/brand/" } },
    ] as never);
    vi.mocked(runImportActor).mockResolvedValue([]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(vi.mocked(runImportActor).mock.calls[0][2].since).toBeNull();
  });

  it("skips refs the client already has (D305)", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    vi.mocked(listBrandImageRefs).mockResolvedValue(new Set([`meta:100_111_122_n.jpg`]));
    const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(result).toEqual({ assetCount: 0, found: 1, failed: 0, since: null });
    expect(uploadImportedBrandMedia).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "Already up to date");
  });

  it("stores a small WebP preview for an image, and for a video from its poster", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1), post(3, { videoUrl: `${CDN}reel.mp4` })]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch("image/jpeg") });
    const rows = vi.mocked(insertImportedBrandImage).mock.calls.map((c) => c[0]);
    expect(rows.map((r) => r.mediaType).sort()).toEqual(["image", "video"]);
    for (const r of rows) expect(r.thumbnailUrl).toMatch(/\/preview\.webp$/);
    // Displayed size, for the masonry — width and height swapped for the rotated orientation.
    for (const r of rows) expect([r.width, r.height]).toEqual([1080, 1350]);
    const previewUpload = vi.mocked(uploadImportedBrandMedia).mock.calls.find((c) => c[0].filename === "preview.webp");
    expect(previewUpload?.[0].contentType).toBe("image/webp");
  });

  it("makes no preview for an SVG — it is shown as it is", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch("image/svg+xml") });
    expect(vi.mocked(insertImportedBrandImage).mock.calls[0][0].thumbnailUrl).toBeNull();
  });

  it("keeps the run a success when only some assets fail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1), post(2)]);
    vi.mocked(insertImportedBrandImage)
      .mockImplementationOnce(async (r) => ({ id: r.id }) as never)
      .mockRejectedValueOnce(new Error("boom"));
    const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(result).toMatchObject({ assetCount: 1, failed: 1 });
    expect(succeedJob).toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("fails the run when every new asset fails to save, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1), post(2)]);
    vi.mocked(insertImportedBrandImage).mockRejectedValue(new Error('column "width" does not exist'));
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(succeedJob).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith("job-1", "Found 2 new assets but couldn't save them. Try again in a few minutes.");
    expect(JSON.stringify(log.mock.calls)).toContain("width");
    log.mockRestore();
  });

  it("removes the uploaded files of an asset whose row was not written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    vi.mocked(insertImportedBrandImage).mockRejectedValue(new Error("insert failed"));
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    // The original and its preview were both uploaded, and both are removed.
    expect(vi.mocked(removeObject).mock.calls.map((c) => String(c[0]))).toEqual(
      vi.mocked(uploadImportedBrandMedia).mock.calls.map((c) => expect.stringContaining(c[0].filename)),
    );
    expect(removeObject).toHaveBeenCalledTimes(2);
  });

  it("fails the job with the source's reason when it yields nothing", async () => {
    vi.mocked(getJob).mockResolvedValue(job("facebook") as never);
    vi.mocked(runImportActor).mockResolvedValue([{ error: "not_available" }]);
    expect(await runAssetImport("job-1", { fetchImpl: mediaFetch() })).toBeNull();
    expect(failJob).toHaveBeenCalledWith("job-1", expect.stringMatching(/isn't public/));
  });

  it("fails in plain words when the provider breaks, keeping the cause out of sight", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getJob).mockResolvedValue(job("website") as never);
    vi.mocked(runImportActor).mockRejectedValue(new Error("Apify could not start the website scrape (HTTP 402)."));
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    const shown = vi.mocked(failJob).mock.calls[0][1];
    expect(shown).toBe("We couldn't load the website right now. Try again in a few minutes.");
    expect(shown).not.toMatch(/apify|http|scrape/i);
    expect(log).toHaveBeenCalled(); // the real cause is logged on the server
    log.mockRestore();
  });

  it("treats a refresh with nothing new as done, not failed", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(latestImportedPostAt).mockResolvedValue(new Date(Date.now() - 86_400_000).toISOString());
    vi.mocked(runImportActor).mockResolvedValue([{ error: "no_items" }]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(failJob).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ assetCount: 0 }), "No new posts");
    // A refresh never falls back to old posts.
    expect(runImportActor).toHaveBeenCalledTimes(1);
  });

  describe("Social fallback: nothing in the last 3 months", () => {
    const old = (n: number) => post(n, { timestamp: "2025-01-01T00:00:00Z" });

    it("takes the page's latest posts, whatever their age", async () => {
      vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
      vi.mocked(runImportActor).mockResolvedValueOnce([{ error: "no_items" }]).mockResolvedValueOnce([old(1), old(2)]);
      const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(vi.mocked(runImportActor).mock.calls[1][2]).toMatchObject({ latest: true });
      expect(result).toEqual({ assetCount: 2, found: 2, failed: 0, since: null, latest: true });
      expect(failJob).not.toHaveBeenCalled();
    });

    it("also falls back when the window holds only old pinned posts", async () => {
      vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
      vi.mocked(runImportActor).mockResolvedValueOnce([old(1)]).mockResolvedValueOnce([old(1), old(2), old(3)]);
      const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(runImportActor).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ assetCount: 3, latest: true });
    });

    it("does not fall back when the window has posts", async () => {
      vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
      vi.mocked(runImportActor).mockResolvedValue([post(1)]);
      await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(runImportActor).toHaveBeenCalledTimes(1);
    });

    it("does not fall back when the page is private or missing", async () => {
      vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
      vi.mocked(runImportActor).mockResolvedValue([{ error: "not_available" }]);
      await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(runImportActor).toHaveBeenCalledTimes(1);
      expect(failJob).toHaveBeenCalledWith("job-1", expect.stringMatching(/isn't public/));
    });

    it("finishes (not fails) with \"This page has no posts\" when the page has never posted", async () => {
      vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
      vi.mocked(runImportActor).mockResolvedValue([{ error: "no_items" }]);
      const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(failJob).not.toHaveBeenCalled();
      expect(succeedJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ assetCount: 0 }), "This page has no posts");
      expect(result).toMatchObject({ assetCount: 0, latest: true });
    });

    it("does not announce the fallback, and keeps both runs inside one scrape budget", async () => {
      vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
      vi.mocked(runImportActor).mockResolvedValue([{ error: "no_items" }]);
      await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(setJobPhase).not.toHaveBeenCalled();
      const [first, second] = vi.mocked(runImportActor).mock.calls.map((c) => c[2].deadlineMs!);
      expect(first).toBe(12 * 60_000);
      expect(second).toBeLessThanOrEqual(first);
    });

    it("does the same for Facebook", async () => {
      vi.mocked(getJob).mockResolvedValue(job("facebook") as never);
      const fbPost = (n: number) => ({
        url: `https://www.facebook.com/brand/posts/${n}`,
        time: "2025-01-01T00:00:00Z",
        media: [{ __typename: "Photo", image: { uri: `${CDN}${n}00_${n}11_${n}22_n.jpg` } }],
      });
      vi.mocked(runImportActor).mockResolvedValueOnce([{ error: "no_items" }]).mockResolvedValueOnce([fbPost(1), fbPost(2)]);
      const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(vi.mocked(runImportActor).mock.calls[1][2]).toMatchObject({ latest: true });
      expect(result).toMatchObject({ assetCount: 2, found: 2, latest: true });
    });

    it("never falls back for a website", async () => {
      vi.mocked(getJob).mockResolvedValue(job("website") as never);
      vi.mocked(runImportActor).mockResolvedValue([]);
      await runAssetImport("job-1", { fetchImpl: mediaFetch() });
      expect(runImportActor).toHaveBeenCalledTimes(1);
    });
  });
});

// D483: an import's memory stays bounded, a file over its limit is skipped and named, and a
// retry after a crash continues instead of paying for a new scrape.
describe("runAssetImport, memory and crashes", () => {
  const VIDEO = `${CDN}reel.mp4`;
  const reel = (n: number) => post(n, { videoUrl: VIDEO });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.APIFY_TOKEN = "tok";
    vi.mocked(listBrandImageRefs).mockResolvedValue(new Set());
    vi.mocked(insertImportedBrandImage).mockImplementation(async (r) => ({ id: r.id }) as never);
    vi.mocked(listRecentJobs).mockResolvedValue([]);
    vi.mocked(latestImportedPostAt).mockResolvedValue(null);
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
  });

  it("streams a video into storage rather than holding it whole", async () => {
    vi.mocked(runImportActor).mockResolvedValue([reel(1)]);
    const fetchImpl = fetchByUrl((url) => (url === VIDEO ? { contentType: "video/mp4", bytes: 8 } : { contentType: "image/jpeg", bytes: 3 }));
    await runAssetImport("job-1", { fetchImpl });
    const streamed = vi.mocked(uploadImportedBrandMediaStream).mock.calls[0][0];
    expect(streamed.contentType).toBe("video/mp4");
    // The only whole-file upload is the poster's small preview.
    expect(vi.mocked(uploadImportedBrandMedia).mock.calls.map((c) => c[0].filename)).toEqual(["preview.webp"]);
    expect(vi.mocked(insertImportedBrandImage).mock.calls[0][0]).toMatchObject({ mediaType: "video", sizeBytes: 8 });
  });

  it("stops a video that passes its limit part way, and keeps nothing of it", async () => {
    vi.mocked(runImportActor).mockResolvedValue([reel(1), post(2)]);
    const fetchImpl = fetchByUrl((url) => (url === VIDEO ? { contentType: "video/mp4", bytes: 20 } : { contentType: "image/jpeg", bytes: 3 }));
    const result = await runAssetImport("job-1", { fetchImpl });
    expect(vi.mocked(insertImportedBrandImage).mock.calls.map((c) => c[0].mediaType)).toEqual(["image"]);
    expect(result).toMatchObject({ assetCount: 1, failed: 1, skipped: [expect.objectContaining({ reason: expect.stringContaining("too large") })] });
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "1 new · 1 couldn't be saved");
  });

  it("refuses an image whose declared size is over its limit before reading it", async () => {
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    const fetchImpl = fetchByUrl(() => ({ contentType: "image/jpeg", bytes: 3, headers: { "content-length": String(30 * 1024 * 1024) } }));
    await runAssetImport("job-1", { fetchImpl });
    expect(uploadImportedBrandMedia).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith("job-1", "Found 1 new asset but couldn't save them. Try again in a few minutes.");
  });

  it("names at most 20 skipped files, and counts them all", async () => {
    vi.mocked(runImportActor).mockResolvedValue([...Array.from({ length: 25 }, (_, i) => post(i + 1)), reel(99)]);
    const fetchImpl = fetchByUrl((url) => (url === VIDEO ? { contentType: "video/mp4", bytes: 3 } : { contentType: "text/html", bytes: 3 }));
    const result = await runAssetImport("job-1", { fetchImpl });
    expect(result).toMatchObject({ assetCount: 1, failed: 25 });
    expect(result?.skipped).toHaveLength(20);
  });

  it("records the Apify run it starts, so a retry can continue it", async () => {
    vi.mocked(runImportActor).mockImplementation(async (_s, _t, opts) => {
      await opts.onStarted?.("run-new");
      return [post(1)];
    });
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(saveJobCheckpoint).toHaveBeenCalledWith("job-1", { windowRunId: "run-new" });
  });

  it("continues the Apify run a crashed attempt started, instead of starting a new one", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job("instagram"), status: "running", result: { checkpoint: { windowRunId: "run-old" } } } as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(vi.mocked(runImportActor).mock.calls[0][2]).toMatchObject({ resumeRunId: "run-old" });
  });

  it("does nothing when retried after its job has already ended", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job("instagram"), status: "succeeded" } as never);
    expect(await runAssetImport("job-1", { fetchImpl: mediaFetch() })).toBeNull();
    expect(runImportActor).not.toHaveBeenCalled();
    expect(succeedJob).not.toHaveBeenCalled();
  });
});
