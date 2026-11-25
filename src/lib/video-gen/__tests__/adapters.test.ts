import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ kling: vi.fn(), seedance: vi.fn(), omni: vi.fn() }));
vi.mock("@/lib/video-gen/providers/kling", async (orig) => ({
  ...(await orig<typeof import("@/lib/video-gen/providers/kling")>()),
  generateWithKling: calls.kling,
}));
vi.mock("@/lib/video-gen/providers/seedance", async (orig) => ({
  ...(await orig<typeof import("@/lib/video-gen/providers/seedance")>()),
  generateWithSeedance: calls.seedance,
}));
vi.mock("@/lib/video-gen/providers/gemini-omni", async (orig) => ({
  ...(await orig<typeof import("@/lib/video-gen/providers/gemini-omni")>()),
  generateWithOmni: calls.omni,
}));

import { videoAdapters } from "../adapters";
import { klingEndpoint, build3_0Settings, build30OmniSettings } from "../providers/kling";
import { buildSeedanceBody, SEEDANCE_VENDOR_MODEL } from "../providers/seedance";
import { OMNI_12 } from "../providers/gemini-omni";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { toVideoClientSpec } from "@/lib/ai-models/to-spec";

const INPUT = { prompt: "A cab door opens", referenceUrls: [], params: {} };
const ctx = (id: string, providerModelId: string) => ({
  spec: toVideoClientSpec(seededModelCatalog().models.find((m) => m.id === id)!),
  providerModelId,
});

beforeEach(() => vi.clearAllMocks());

describe("videoAdapters (D561)", () => {
  it("registers exactly the live and hidden video models' adapter keys, each once", () => {
    const keys = seededModelCatalog().models
      .filter((m) => m.kind === "video" && m.status !== "retired")
      .map((m) => m.adapterKey);
    expect(Object.keys(videoAdapters).sort()).toEqual([...new Set(keys)].sort());
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it("Kling: the endpoint is the row's model name, the rest is the same as before", async () => {
    expect(klingEndpoint("kling-3-0", "kling-3.0", 0)).toEqual({
      endpointPath: "/image-to-video/kling-3.0", falModel: "kling-3-0", supportsReferences: false, requiresStartFrame: true,
    });
    expect(klingEndpoint("kling-o1", "kling-o1", 5)).toEqual({
      endpointPath: "/omni-video/kling-o1", falModel: "kling-o1", supportsReferences: true, requiresStartFrame: false,
    });
    await videoAdapters["video:kling-3-0-omni"](INPUT, ctx("kling:kling-3-0-omni", "kling-3.0-omni"));
    expect(calls.kling).toHaveBeenCalledWith(klingEndpoint("kling-3-0-omni", "kling-3.0-omni", 5), build30OmniSettings, INPUT);
    await videoAdapters["video:kling-3-0"](INPUT, ctx("kling:kling-3-0", "kling-3.0"));
    expect(calls.kling).toHaveBeenLastCalledWith(klingEndpoint("kling-3-0", "kling-3.0", 0), build3_0Settings, INPUT);
  });

  it("Seedance: its reference cap from the catalog spec and its dated model from the row", async () => {
    await videoAdapters["video:seedance-2-5"](INPUT, ctx("seedance:seedance-2-5", "dreamina-seedance-2-5-270101"));
    expect(calls.seedance).toHaveBeenCalledWith(INPUT, 30, "dreamina-seedance-2-5-270101");
    expect(buildSeedanceBody(INPUT, 30, "dreamina-seedance-2-5-270101").model).toBe("dreamina-seedance-2-5-270101");
    expect(buildSeedanceBody(INPUT, 30).model).toBe(SEEDANCE_VENDOR_MODEL);
  });

  it("Omni: the version's limits from code and the API model from the row", async () => {
    await videoAdapters["video:gemini-omni-1.2-flash"](INPUT, ctx("gemini:gemini-omni-1.2-flash", "gemini-omni-1.2-flash-next"));
    expect(calls.omni).toHaveBeenCalledWith(INPUT, { ...OMNI_12, apiModel: "gemini-omni-1.2-flash-next" });
  });
});
