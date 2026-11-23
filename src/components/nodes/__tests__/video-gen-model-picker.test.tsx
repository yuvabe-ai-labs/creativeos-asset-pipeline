import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { videoModelsFrom, type VideoModels } from "@/lib/ai-models/model-lists";

const state = vi.hoisted(() => ({ videos: null as unknown as VideoModels }));
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useVideoModels: () => state.videos,
}));

import { VideoGenModelPicker } from "../video-gen-model-picker";

const OMNI = "gemini:gemini-omni-1.2-flash";
const KLING_OMNI = "kling:kling-3-0-omni";

const render = (modelId: string) =>
  renderToStaticMarkup(<VideoGenModelPicker modelId={modelId} onModelChange={() => {}} />);

describe("VideoGenModelPicker", () => {
  it("offers live models with the catalog's picker labels, and no retired model", () => {
    state.videos = videoModelsFrom(withModel(seededModelCatalog(), OMNI, { pickerLabel: "Omni Next" }));
    const html = render(OMNI);
    expect(html).toContain("Omni Next");
    expect(html).not.toContain("3.1 Fast"); // Veo is retired in the seed
  });

  it("shows a hidden model only on the node that uses it", () => {
    state.videos = videoModelsFrom(withModel(seededModelCatalog(), KLING_OMNI, { status: "hidden" }));
    expect(render(OMNI)).not.toContain("3.0 Omni");
    expect(render(KLING_OMNI)).toContain("3.0 Omni");
  });

  it("reads which hidden model is the caller's own from ownModelId when passed (Edit's take)", () => {
    state.videos = videoModelsFrom(withModel(seededModelCatalog(), KLING_OMNI, { status: "hidden" }));
    const withOwn = (modelId: string, ownModelId: string | null) =>
      renderToStaticMarkup(<VideoGenModelPicker modelId={modelId} ownModelId={ownModelId} onModelChange={() => {}} />);
    expect(withOwn(KLING_OMNI, null)).not.toContain("3.0 Omni");
    expect(withOwn(OMNI, KLING_OMNI)).toContain("3.0 Omni");
  });
});
