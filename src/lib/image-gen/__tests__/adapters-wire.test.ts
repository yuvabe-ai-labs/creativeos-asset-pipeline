import { describe, it, expect, vi, beforeEach } from "vitest";

// D561 — behaviour must not change when the server moves from the registries to the adapter maps.
// Each adapter runs against the real provider code (only the SDKs and fetch are fake) with the
// provider_model_id migration 0084 seeds, and the vendor model name that leaves the process must
// be the one each model sends today.

vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({
  openaiGenerate: vi.fn(),
  generateContent: vi.fn(),
  interactionsCreate: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/openai/server", () => ({
  createOpenAI: () => ({ images: { generate: sdk.openaiGenerate, edit: sdk.openaiGenerate } }),
}));
vi.mock("@/lib/gemini/server", () => ({
  createGemini: () => ({ models: { generateContent: sdk.generateContent }, interactions: { create: sdk.interactionsCreate } }),
}));
vi.stubGlobal("fetch", sdk.fetch);

import { imageAdapters } from "../adapters";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { toImageClientSpec } from "@/lib/ai-models/to-spec";

// The vendor model each image model sends today (the registries' literals, before D561).
const TODAY: Record<string, string> = {
  "openai:gpt-image-2.5-sunburst": "gpt-image-2.5-sunburst",
  "openai:gpt-image-2.5-flare": "gpt-image-2.5-flare",
  "openai:gpt-image-2": "gpt-image-2",
  "openai:gpt-image-1-mini": "gpt-image-1-mini",
  "gemini:gemini-2.5-flash-image": "gemini-2.5-flash-image",
  "gemini:gemini-3.1-flash-image": "gemini-3.1-flash-image",
  "gemini:gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
  "gemini:gemini-3-pro-image": "gemini-3-pro-image",
  "seedream:seedream-5-0-lite": "seedream-5-0-lite-260128",
  "seedream:seedream-5-0-pro": "dola-seedream-5-0-pro-260628",
};

const STOP = new Error("stop after the request is captured");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BYTEPLUS_API_KEY", "test-key");
  sdk.openaiGenerate.mockRejectedValue(STOP);
  sdk.generateContent.mockRejectedValue(STOP);
  sdk.interactionsCreate.mockRejectedValue(STOP);
  sdk.fetch.mockRejectedValue(STOP);
});

/** The model name in the one request the adapter sent, whichever SDK or URL it went through. */
function sentModel(): string | undefined {
  const sdkCall = [sdk.openaiGenerate, sdk.generateContent, sdk.interactionsCreate].find((f) => f.mock.calls.length > 0);
  if (sdkCall) return sdkCall.mock.calls[0][0].model;
  const init = sdk.fetch.mock.calls[0]?.[1] as RequestInit | undefined;
  return init ? JSON.parse(String(init.body)).model : undefined;
}

const liveImageModels = seededModelCatalog().models.filter((m) => m.kind === "image" && m.status !== "retired");

describe("image adapters send today's vendor model (D561)", () => {
  it("covers every live and hidden image model", () => {
    expect(liveImageModels.map((m) => m.id).sort()).toEqual(Object.keys(TODAY).sort());
  });

  it.each(liveImageModels.map((m) => [m.id, m] as const))("%s", async (id, model) => {
    const run = imageAdapters[model.adapterKey](
      { prompt: "A mug", referenceUrls: [], params: { aspect_ratio: "1:1" } },
      { spec: toImageClientSpec(model), providerModelId: model.providerModelId! },
    );
    await expect(run).rejects.toThrow();
    expect(sentModel()).toBe(TODAY[id]);
  });
});
