import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({
  getJob: vi.fn(),
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

import { failJob, getJob, succeedJob } from "@/lib/jobs/db";
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
    expect(result).toEqual({ assetCount: 2, found: 2, failed: 0 });
    const row = vi.mocked(insertImportedBrandImage).mock.calls[0][0];
    expect(row).toMatchObject({ clientId: "client-1", source: "instagram", mediaType: "image", fileExt: "jpg" });
    expect(row.sourceRef).toMatch(/^meta:/);
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "2 new");
  });

  it("skips refs the client already has (D305)", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    vi.mocked(listBrandImageRefs).mockResolvedValue(new Set([`meta:100_111_122_n.jpg`]));
    const result = await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(result).toEqual({ assetCount: 0, found: 1, failed: 0 });
    expect(uploadImportedBrandMedia).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "Already up to date");
  });

  it("stores a video's poster beside it", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(3, { videoUrl: `${CDN}reel.mp4` })]);
    await runAssetImport("job-1", { fetchImpl: mediaFetch("video/mp4") });
    const row = vi.mocked(insertImportedBrandImage).mock.calls[0][0];
    expect(row.mediaType).toBe("video");
    expect(row.thumbnailUrl).toContain("/poster.mp4");
  });

  it("counts a download that is not media as failed, without failing the job", async () => {
    vi.mocked(getJob).mockResolvedValue(job("instagram") as never);
    vi.mocked(runImportActor).mockResolvedValue([post(1)]);
    const result = await runAssetImport("job-1", { fetchImpl: mediaFetch("text/html") });
    expect(result).toEqual({ assetCount: 0, found: 1, failed: 1 });
    expect(failJob).not.toHaveBeenCalled();
  });

  it("fails the job with the source's reason when it yields nothing", async () => {
    vi.mocked(getJob).mockResolvedValue(job("facebook") as never);
    vi.mocked(runImportActor).mockResolvedValue([{ error: "not_available" }]);
    expect(await runAssetImport("job-1", { fetchImpl: mediaFetch() })).toBeNull();
    expect(failJob).toHaveBeenCalledWith("job-1", expect.stringMatching(/isn't public/));
  });

  it("fails the job when the scrape throws", async () => {
    vi.mocked(getJob).mockResolvedValue(job("website") as never);
    vi.mocked(runImportActor).mockRejectedValue(new Error("Apify could not start"));
    await runAssetImport("job-1", { fetchImpl: mediaFetch() });
    expect(failJob).toHaveBeenCalledWith("job-1", "Apify could not start");
  });
});
