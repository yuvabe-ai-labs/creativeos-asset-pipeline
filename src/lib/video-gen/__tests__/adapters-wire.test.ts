import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// D561 — behaviour must not change when the server moves from the registries to the adapter maps.
// Each adapter runs against the real provider code (only fetch and the fal client are fake) with
// the provider_model_id migration 0084 seeds, and what leaves the process must name the vendor
// model each model sends today.

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk/v3", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const fake = vi.hoisted(() => ({ fetch: vi.fn(), submitFalJob: vi.fn() }));
vi.mock("@/lib/fal/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/fal/client")>()),
  submitFalJob: fake.submitFalJob,
}));
vi.stubGlobal("fetch", fake.fetch);

import { videoAdapters } from "../adapters";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { toVideoClientSpec } from "@/lib/ai-models/to-spec";
import type { VideoGenInput } from "../types";

const STOP = new Error("stop after the request is captured");
const API_HOSTS = ["https://api-singapore.klingai.com", "https://ark.", "https://generativelanguage.googleapis.com"];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KLING_API_KEY", "k");
  vi.stubEnv("BYTEPLUS_API_KEY", "k");
  vi.stubEnv("GOOGLE_GENAI_API_KEY", "k");
  vi.stubEnv("FAL_KEY", "k");
  // Image downloads (the start frame's shape check) are answered 404: the documented pass-through.
  fake.fetch.mockImplementation(async (url: string) => {
    if (API_HOSTS.some((h) => String(url).startsWith(h))) throw STOP;
    return { ok: false, status: 404 };
  });
  fake.submitFalJob.mockRejectedValue(STOP);
});
afterEach(() => vi.unstubAllEnvs());

const model = (id: string) => seededModelCatalog().models.find((m) => m.id === id)!;
const INPUT: VideoGenInput = {
  prompt: "A cab door opens",
  referenceUrls: [],
  startFrameUrl: "https://x.test/start.png",
  params: { duration: 5 },
};

async function run(id: string, input: VideoGenInput = INPUT) {
  const m = model(id);
  await expect(
    videoAdapters[m.adapterKey](input, { spec: toVideoClientSpec(m), providerModelId: m.providerModelId! }),
  ).rejects.toThrow();
}

/** The vendor API requests only, without the image downloads. */
function apiCalls() {
  return fake.fetch.mock.calls.filter(([url]) => API_HOSTS.some((h) => String(url).startsWith(h)));
}

describe("video adapters send today's vendor model (D561)", () => {
  it("covers every live and hidden video model below", () => {
    const live = seededModelCatalog().models.filter((m) => m.kind === "video" && m.status !== "retired");
    expect(live.map((m) => m.id).sort()).toEqual([
      "gemini:gemini-omni-1.1-flash", "gemini:gemini-omni-1.2-flash",
      "kling:kling-3-0", "kling:kling-3-0-omni", "kling:kling-o1", "seedance:seedance-2-5",
    ]);
  });

  describe("Kling on fal (the default transport)", () => {
    // fal names its own models. The adapter must keep the fal key (kling-3-0), never the Kling
    // API's name in provider_model_id (kling-3.0), or fal gets an endpoint that does not exist.
    it.each([
      ["kling:kling-3-0", "fal-ai/kling-video/v3/standard/image-to-video"],
      ["kling:kling-o1", "fal-ai/kling-video/o1/image-to-video"],
      ["kling:kling-3-0-omni", "fal-ai/kling-video/o3/standard/reference-to-video"],
    ])("%s → %s", async (id, endpoint) => {
      await run(id);
      expect(fake.submitFalJob).toHaveBeenCalledTimes(1);
      expect(fake.submitFalJob.mock.calls[0][0]).toBe(endpoint);
      expect(apiCalls()).toHaveLength(0);
    });
  });

  describe("Kling native (KLING_TRANSPORT=native)", () => {
    it.each([
      ["kling:kling-3-0", "https://api-singapore.klingai.com/image-to-video/kling-3.0"],
      ["kling:kling-o1", "https://api-singapore.klingai.com/omni-video/kling-o1"],
      ["kling:kling-3-0-omni", "https://api-singapore.klingai.com/omni-video/kling-3.0-omni"],
    ])("%s → %s", async (id, url) => {
      vi.stubEnv("KLING_TRANSPORT", "native");
      await run(id);
      expect(apiCalls().map(([u]) => u)).toEqual([url]);
      expect(fake.submitFalJob).not.toHaveBeenCalled();
    });
  });

  it("Seedance sends its dated BytePlus model", async () => {
    await run("seedance:seedance-2-5");
    const [[url, init]] = apiCalls();
    expect(url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks");
    expect(JSON.parse(String(init.body)).model).toBe("dreamina-seedance-2-5-260628");
  });

  it.each([
    ["gemini:gemini-omni-1.2-flash", "gemini-omni-1.2-flash"],
    ["gemini:gemini-omni-1.1-flash", "gemini-omni-1.1-flash"],
  ])("Omni %s sends %s", async (id, apiModel) => {
    // Text only: Omni downloads each image before the request, and a failed download stops it.
    await run(id, { ...INPUT, startFrameUrl: undefined });
    const [[, init]] = apiCalls();
    expect(JSON.parse(String(init.body)).model).toBe(apiModel);
  });
});
