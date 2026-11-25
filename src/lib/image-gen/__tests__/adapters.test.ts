import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ openai: vi.fn(), gemini: vi.fn(), interactions: vi.fn(), seedream: vi.fn() }));
vi.mock("@/lib/image-gen/providers/openai", () => ({ generateWithOpenAI: calls.openai }));
vi.mock("@/lib/image-gen/providers/gemini", () => ({
  generateWithGemini: calls.gemini,
  generateWithGeminiInteractions: calls.interactions,
}));
vi.mock("@/lib/image-gen/providers/seedream", async (orig) => ({
  ...(await orig<typeof import("@/lib/image-gen/providers/seedream")>()),
  generateWithSeedream: calls.seedream,
}));

import { imageAdapters } from "../adapters";
import { SEEDREAM_LITE } from "../providers/seedream";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { toImageClientSpec } from "@/lib/ai-models/to-spec";

const INPUT = { prompt: "A mug", referenceUrls: [], params: {} };
const ctx = (id: string, providerModelId: string) => ({
  spec: toImageClientSpec(seededModelCatalog().models.find((m) => m.id === id)!),
  providerModelId,
});

beforeEach(() => vi.clearAllMocks());

describe("imageAdapters (D561)", () => {
  it("registers exactly the live and hidden image models' adapter keys, each once", () => {
    const keys = seededModelCatalog().models
      .filter((m) => m.kind === "image" && m.status !== "retired")
      .map((m) => m.adapterKey);
    expect(Object.keys(imageAdapters).sort()).toEqual([...new Set(keys)].sort());
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it("calls the provider with the row's model name, so a vendor bump needs no deploy", async () => {
    await imageAdapters["image:gpt-image-2"](INPUT, ctx("openai:gpt-image-2", "gpt-image-2-2027"));
    expect(calls.openai).toHaveBeenCalledWith("gpt-image-2-2027", INPUT);
  });

  it("sends Nano Banana 2.1 through the Interactions API and the others through generateContent", async () => {
    await imageAdapters["image:gemini-nano-banana-2.1"](INPUT, ctx("gemini:gemini-nano-banana-2.1", "gemini-nano-banana-2.1"));
    await imageAdapters["image:gemini-3-pro-image"](INPUT, ctx("gemini:gemini-3-pro-image", "gemini-3-pro-image"));
    expect(calls.interactions).toHaveBeenCalledWith("gemini-nano-banana-2.1", INPUT);
    expect(calls.gemini).toHaveBeenCalledWith("gemini-3-pro-image", INPUT);
  });

  it("keeps Seedream's sizes and batch mode from code and takes its dated model from the row", async () => {
    await imageAdapters["image:seedream-5-0-lite"](INPUT, ctx("seedream:seedream-5-0-lite", "seedream-5-0-lite-270101"));
    expect(calls.seedream).toHaveBeenCalledWith({ ...SEEDREAM_LITE, arkModel: "seedream-5-0-lite-270101" }, INPUT);
  });
});
