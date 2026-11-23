import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiCatalog } from "@/lib/ai-models/types";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ catalog: null as AiCatalog | null }));
const adapter = vi.hoisted(() =>
  vi.fn(async () => ({
    imageBase64: "", mimeType: "image/png",
    tokensUsed: { text_input_tokens: 0, image_input_tokens: 0, image_output_tokens: 0, total_tokens: 0 },
  })),
);
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return { getAiCatalog: async () => state.catalog ?? seededModelCatalog() };
});
vi.mock("@/lib/image-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { imageAdapters: stubAdapters("image", adapter) };
});

import { imageRun, imageGenerateForTask } from "../image-run";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { ModelUnavailableError, MODEL_UNAVAILABLE_MESSAGE } from "@/lib/ai-models/runnable";

const INPUT = { prompt: "A mug", referenceUrls: [], params: {} };

beforeEach(() => {
  state.catalog = null;
  adapter.mockClear();
});

describe("imageRun (D538, D540)", () => {
  it("gives the catalog's spec, and a generate that hands the adapter that spec and the row's model name", async () => {
    const r = imageRun(seededModelCatalog(), "openai:gpt-image-2");
    if (!r.ok) throw new Error("expected a run");
    expect(r.spec).toMatchObject({ id: "openai:gpt-image-2", label: "GPT Image 2", maxReferenceImages: 16, supportsMask: true });
    expect(r.spec.schema.safeParse({}).success).toBe(true);
    await r.generate(INPUT);
    expect(adapter).toHaveBeenCalledWith(INPUT, { spec: r.spec, providerModelId: "gpt-image-2" });
  });

  it("passes a refusal through", () => {
    expect(imageRun(seededModelCatalog(), "openai:gpt-image-1")).toMatchObject({ ok: false, reason: "retired" });
  });
});

describe("imageGenerateForTask (D541)", () => {
  it("runs a model the route accepted, even if it was hidden since", async () => {
    state.catalog = withModel(seededModelCatalog(), "openai:gpt-image-2", { status: "hidden" });
    await (await imageGenerateForTask("openai:gpt-image-2"))(INPUT);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("fails for good when the row or its adapter is gone", async () => {
    await expect(imageGenerateForTask("openai:gpt-image-9")).rejects.toThrow(ModelUnavailableError);
    await expect(imageGenerateForTask("openai:gpt-image-1")).rejects.toThrow(MODEL_UNAVAILABLE_MESSAGE);
  });
});
