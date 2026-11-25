import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, type ImageModels } from "@/lib/ai-models/model-lists";

const state = vi.hoisted(() => ({ images: null as unknown as ImageModels }));
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => state.images,
}));

import { ImageGenOutputSettings } from "../image-gen-output-settings";

const PRO = "gemini:gemini-3-pro-image";

function render(modelId: string) {
  const model = state.images.specOrDefault(modelId);
  return renderToStaticMarkup(
    <ImageGenOutputSettings model={model} values={{}} onValuesChange={() => {}} onCommit={() => {}} onModelChange={() => {}} />,
  );
}

describe("ImageGenOutputSettings model chips", () => {
  it("omits a hidden model unless it is the selected one, and never shows a retired model", () => {
    state.images = imageModelsFrom(withModel(seededModelCatalog(), PRO, { status: "hidden", label: "Pro Hidden" }));
    const other = render("openai:gpt-image-2");
    expect(other).toContain("GPT Image 2.5 Sunburst");
    expect(other).not.toContain("Pro Hidden");
    expect(other).not.toMatch(/GPT Image 1</);

    const own = render(PRO);
    expect(own).toContain("Pro Hidden");
    expect(own).not.toMatch(/GPT Image 1</);
  });
});
