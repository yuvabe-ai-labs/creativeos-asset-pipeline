import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ isOwnStoredUrl: (u: string) => u.startsWith("https://own/") }));
import { resolveDubSource } from "../source";

const VG = { nodeId: "vg", type: "video-gen", data: {}, activeOutput: "https://own/v.mp4", versionId: "sv" };
const ver = (over = {}) => ({ id: "sv", node_id: "vg", output: "https://own/v.mp4", error: null, params_used: { durationSeconds: 8 }, ...over });

describe("resolveDubSource", () => {
  it("takes the connected video's active version as-is", async () => {
    const r = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver() as never });
    expect(r).toEqual({ ok: true, sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/v.mp4", durationSeconds: 8 });
  });

  it("explains each case it can't dub", async () => {
    const none = await resolveDubSource("n1", { getUpstreamOutputs: async () => [], getVersionById: async () => null });
    expect(none).toEqual({ ok: false, reason: "Connect a video to dub." });
    const noTake = await resolveDubSource("n1", { getUpstreamOutputs: async () => [{ ...VG, versionId: null }], getVersionById: async () => null });
    expect(noTake).toEqual({ ok: false, reason: "The connected video has no finished take yet." });
    const failed = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver({ error: "x" }) as never });
    expect(failed.ok).toBe(false);
    const noLen = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver({ params_used: {} }) as never });
    expect(noLen).toEqual({ ok: false, reason: "This take has no recorded length, so it can't be priced." });
    const long = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver({ params_used: { durationSeconds: 61 } }) as never });
    expect(long).toEqual({ ok: false, reason: "Dubbing works on clips up to a minute." });
  });
});
