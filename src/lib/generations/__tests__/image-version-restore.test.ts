import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";
import { imageVersionRestore } from "../version-params";

const NANO_PRO = "gemini:gemini-3-pro-image";
const SUNBURST = "openai:gpt-image-2.5-sunburst";
const GPT1 = "openai:gpt-image-1"; // retired in the seed

describe("imageVersionRestore (D467, D565, D567)", () => {
  const images = imageModelsFrom(seededModelCatalog());

  it("puts back an offered model and its settings, and clears the retired notice when the model changes", () => {
    const out = imageVersionRestore(images, { output: "https://x/a.png", modelUsed: NANO_PRO, paramsUsed: {} }, SUNBURST);
    expect(out.modelId).toBe(NANO_PRO);
    expect(out.params).not.toBeNull();
    expect(out.patch).toEqual({ parsed: "https://x/a.png", modelId: NANO_PRO, params: out.params, retiredModelId: undefined });
    expect("retiredModelId" in out.patch).toBe(true);
  });

  it("keeps the notice when the restored model is the one already set", () => {
    const out = imageVersionRestore(images, { output: "https://x/a.png", modelUsed: NANO_PRO }, NANO_PRO);
    expect("retiredModelId" in out.patch).toBe(false);
  });

  it("reads the model off params_used first", () => {
    const out = imageVersionRestore(images, { modelUsed: SUNBURST, paramsUsed: { modelId: NANO_PRO } }, SUNBURST);
    expect(out.modelId).toBe(NANO_PRO);
  });

  it("brings back only the picture for a model no longer offered here", () => {
    expect(imageVersionRestore(images, { output: "https://x/a.png", modelUsed: GPT1 }, SUNBURST))
      .toEqual({ modelId: null, params: null, patch: { parsed: "https://x/a.png" } });
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" }));
    expect(imageVersionRestore(hidden, { modelUsed: NANO_PRO }, SUNBURST).modelId).toBeNull();
    expect(imageVersionRestore(hidden, { modelUsed: NANO_PRO }, NANO_PRO).modelId).toBe(NANO_PRO);
  });
});
