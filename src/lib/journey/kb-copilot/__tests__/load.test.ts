import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/kb", () => ({ listKBDocuments: vi.fn(), listBrandImages: vi.fn(), listUnreviewedFields: vi.fn() }));
vi.mock("@/lib/db/kb-jobs", () => ({ getLatestKBJob: vi.fn() }));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn() }));
vi.mock("@/lib/jobs/db", () => ({ listRecentJobs: vi.fn(), failStaleJobs: vi.fn() }));

import { getBrandDetails } from "@/lib/db/brand-kit";
import { listBrandImages, listKBDocuments, listUnreviewedFields } from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { failStaleJobs, listRecentJobs } from "@/lib/jobs/db";
import { KB_STALE_AFTER_MS, loadKbContext } from "../load";
import { liveStatus } from "../context";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const client = { id: "c1", slug: "acme", name: "Acme", kb_status: "pending", website_url: "https://acme.com", active_kb_version_id: null } as never;
const job = (kind: string, status: string, over: Record<string, unknown> = {}) =>
  ({ id: "j", kind, status, input: {}, created_at: ago(60_000), updated_at: ago(60_000), ...over }) as never;
const jobsBy = (imports: unknown[], study: unknown[]) =>
  vi.mocked(listRecentJobs).mockImplementation(async (_c, kind) => (kind === "asset-import" ? imports : study) as never);

describe("loadKbContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listKBDocuments).mockResolvedValue([]);
    vi.mocked(listBrandImages).mockResolvedValue([]);
    vi.mocked(getLatestKBJob).mockResolvedValue(null);
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: " acmeskin ", facebook: "" });
    jobsBy([], []);
  });

  it("reads the basics from the client row and the brand details", async () => {
    const { ctx } = await loadKbContext(client, NOW);
    expect(ctx).toMatchObject({ clientName: "Acme", kbStatus: "pending", hasVersion: false, websiteUrl: "https://acme.com", instagram: "acmeskin", facebook: null });
  });

  it("reads what is unreviewed only for a built KB in review", async () => {
    vi.mocked(listUnreviewedFields).mockResolvedValue(["brand_profile.tagline"]);
    const built = { ...(client as object), kb_status: "in_review", active_kb_version_id: "v1" } as never;
    expect((await loadKbContext(built, NOW)).ctx).toMatchObject({ clientSlug: "acme", unreviewed: ["brand_profile.tagline"] });
    expect(listUnreviewedFields).toHaveBeenCalledWith("v1");

    vi.mocked(listUnreviewedFields).mockClear();
    expect((await loadKbContext(client, NOW)).ctx.unreviewed).toBeNull();
    expect((await loadKbContext({ ...(client as object), kb_status: "ready", active_kb_version_id: "v1" } as never, NOW)).ctx.unreviewed).toBeNull();
    expect(listUnreviewedFields).not.toHaveBeenCalled();
  });

  it("fails the whole read when the unreviewed read fails, so a failure never looks like nothing left", async () => {
    vi.mocked(listUnreviewedFields).mockRejectedValue(new Error("boom"));
    await expect(loadKbContext({ ...(client as object), kb_status: "in_review", active_kb_version_id: "v1" } as never, NOW)).rejects.toThrow("boom");
  });

  it("never writes: a polled read does not fail stale jobs", async () => {
    await loadKbContext(client, NOW);
    expect(failStaleJobs).not.toHaveBeenCalled();
  });

  it("takes each source's latest collection: running, and whether it ever ran", async () => {
    jobsBy([
      job("asset-import", "running", { input: { source: "website" } }),
      job("asset-import", "failed", { input: { source: "instagram" } }),
      // Older rows for the same sources are ignored.
      job("asset-import", "failed", { input: { source: "website" }, created_at: ago(3_600_000) }),
      job("asset-import", "succeeded", { input: { source: "instagram" }, created_at: ago(3_600_000) }),
    ], []);
    const { ctx } = await loadKbContext(client, NOW);
    expect(ctx.importing).toEqual(["website"]);
    // A failure was said once in the thread when it happened (D506): the bottom of the panel shows
    // only what is running, never the failed Instagram collection again.
    expect(liveStatus(ctx)).toEqual([{ text: "Collecting images and video from the website…", state: "running" }]);
    expect(ctx.importedBefore.sort()).toEqual(["instagram", "website"]);
  });

  it("does not count a job that stopped reporting long ago as running", async () => {
    vi.mocked(getLatestKBJob).mockResolvedValue({ status: "researching", phase_message: "Reading…", updated_at: ago(KB_STALE_AFTER_MS + 1000) } as never);
    jobsBy(
      [job("asset-import", "running", { input: { source: "website" }, updated_at: ago(KB_STALE_AFTER_MS + 1000) })],
      [job("image-analysis", "running", { updated_at: ago(KB_STALE_AFTER_MS + 1000) })],
    );
    const { ctx } = await loadKbContext(client, NOW);
    expect(ctx.job).toBeNull();
    expect(ctx.importing).toEqual([]);
    expect(ctx.studyingImages).toBe(false);
  });

  it("reports a running build and a running image study, and nothing for a failed one", async () => {
    vi.mocked(getLatestKBJob).mockResolvedValue({ status: "extracting", phase_message: "Reading the documents…", updated_at: ago(5000) } as never);
    jobsBy([], [job("image-analysis", "running")]);
    let { ctx } = await loadKbContext(client, NOW);
    expect(ctx.job).toEqual({ status: "extracting", phaseMessage: "Reading the documents…" });
    expect(ctx.studyingImages).toBe(true);
    jobsBy([], [job("image-analysis", "failed")]);
    ({ ctx } = await loadKbContext(client, NOW));
    expect(liveStatus(ctx)).toEqual([{ text: "Reading the documents…", state: "running" }]);
  });

  it("counts the person's documents, not the website research, and knows every source by its stored name", async () => {
    vi.mocked(listKBDocuments).mockResolvedValue([
      { id: "d1", filename: "brand.pdf" }, { id: "d2", filename: "website-research.md" },
    ] as never);
    vi.mocked(listBrandImages).mockResolvedValue([{ id: "i1", filename: "hero.png", storage_url: "https://cdn/hero.png" }] as never);
    const { ctx, sources } = await loadKbContext(client, NOW);
    expect(ctx.documentCount).toBe(1);
    expect(ctx.imageCount).toBe(1);
    expect(sources.get("d1")).toEqual({ kind: "document", id: "d1", name: "brand.pdf", url: null });
    expect(sources.get("i1")).toEqual({ kind: "image", id: "i1", name: "hero.png", url: "https://cdn/hero.png" });
  });

  it("names the proposal that is running, and nothing once it has ended", async () => {
    const proposal = (status: string) => vi.mocked(listRecentJobs).mockImplementation(async (_c, kind) =>
      (kind === "kb-propose" ? [job("kb-propose", status, { phase_message: "Reading guide.pdf…" })] : []) as never);
    proposal("running");
    expect((await loadKbContext(client, NOW)).ctx.proposing).toBe("Reading guide.pdf…");
    proposal("succeeded");
    expect((await loadKbContext(client, NOW)).ctx.proposing).toBeNull();
  });
});
