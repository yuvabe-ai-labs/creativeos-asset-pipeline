import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({
  getJob: vi.fn(),
  listRecentJobs: vi.fn(async () => []),
  startJob: vi.fn(),
  setJobPhase: vi.fn(),
  succeedJob: vi.fn(),
  failJob: vi.fn(),
}));
vi.mock("@/lib/db/kb", () => ({
  listBrandImageRefs: vi.fn(),
  insertImportedBrandImage: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  uploadImportedBrandMedia: vi.fn(async (a: { imageId: string; filename: string }) => ({
    url: `https://gcs/${a.imageId}/${a.filename}`,
    path: "p",
  })),
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
  return { default: vi.fn(() => chain) };
});

import { failJob, getJob, listRecentJobs, succeedJob } from "@/lib/jobs/db";
import { insertImportedBrandImage, listBrandImageRefs } from "@/lib/db/kb";
import { uploadImportedBrandMedia } from "@/lib/storage";
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
  return vi.fn(async () => ({
    ok: status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })) as unknown as typeof fetch;
}

describe("runAssetImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APIFY_TOKEN = "tok";
    vi.mocked(listBrandImageRefs).mockResolvedValue(new Set());
    vi.mocked(insertImportedBrandImage).mockImplementation(async (r) => ({ id: r.id }) as never);
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

  it("narrows a refresh to posts since the last import of the same handle", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    const day = 24 * 60 * 60 * 1000;
    const lastRun = new Date(Date.now() - 2 * day);
    vi.mocked(listRecentJobs).mockResolvedValue([
      // A later import of a DIFFERENT handle must not count.
      { id: "old-other", status: "succeeded", created_at: new Date(Date.now() - day).toISOString(), input: { source: "instagram", target: "https://www.instagram.com/other/" } },
      { id: "old", status: "succeeded", created_at: lastRun.toISOString(), input: { source: "instagram", target: "https://www.instagram.com/brand/" } },
    ] as never);
    vi.mocked(runImportActor).mockResolvedValue([]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    // A day of overlap before the last run.
    expect(vi.mocked(runImportActor).mock.calls[0][2].since).toBe(new Date(lastRun.getTime() - day).toISOString().slice(0, 10));
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

  it("counts a download that is not media as failed, without failing the job", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    const result = await runAssetImport("job-1", { fetchImpl: mediaFetch("text/html") });
    expect(result).toEqual({ assetCount: 0, found: 1, failed: 1, since: null });
    expect(failJob).not.toHaveBeenCalled();
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
    vi.mocked(listRecentJobs).mockResolvedValue([
      { id: "old", status: "succeeded", created_at: new Date(Date.now() - 86_400_000).toISOString(), input: { source: "instagram", target: "https://www.instagram.com/brand/" } },
    ] as never);
    vi.mocked(runImportActor).mockResolvedValue([{ error: "no_items" }]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(failJob).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ assetCount: 0 }), "No new posts");
  });
});
