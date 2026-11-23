import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { videoModelsFrom, type VideoModels } from "@/lib/ai-models/model-lists";
import { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID } from "@/lib/ai-models/model-ids";
import type { VideoGenVersionSummary } from "../video-gen-version-history";

const state = vi.hoisted(() => ({
  videos: null as unknown as VideoModels,
  picker: null as null | { modelId: string; ownModelId?: string | null },
}));
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useVideoModels: () => state.videos,
}));
vi.mock("@/hooks/queries/node-generation", () => ({
  useStartVideoEdit: () => ({ isPending: false, mutate: () => {} }),
  startErrorMessage: () => "",
}));
vi.mock("../video-gen-model-picker", () => ({
  VideoGenModelPicker: (props: { modelId: string; ownModelId?: string | null }) => {
    state.picker = props;
    return null;
  },
}));

import { VideoGenEditVideo } from "../video-gen-edit-video";

const take = (inputsUsed: VideoGenVersionSummary["inputsUsed"] = { prompt: "p" }) =>
  ({ id: "v3", output: "https://x/v3.mp4", error: null, paramsUsed: { durationSeconds: 6 }, inputsUsed, createdAt: "2026-11-23T00:00:00Z" }) as VideoGenVersionSummary;

const render = (versions: VideoGenVersionSummary[], nodeModelId: string | null) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <VideoGenEditVideo
        nodeId="n1" versions={versions} sourceId="v3" images={[]} running={false} editing={false} locked={null}
        value={undefined} onChange={() => {}} onStarted={() => {}} nodeModelId={nodeModelId}
      />
    </QueryClientProvider>,
  );

describe("VideoGenEditVideo model (D540, D543)", () => {
  beforeEach(() => { state.picker = null; });

  it("starts on Omni 1.2 while it is live", () => {
    state.videos = videoModelsFrom(seededModelCatalog());
    render([take()], "kling:kling-3-0-omni");
    expect(state.picker?.modelId).toBe(GEMINI_OMNI_12_MODEL_ID);
  });

  it("starts on the first offered edit model when Omni 1.2 is hidden and the node isn't on it", () => {
    state.videos = videoModelsFrom(withModel(seededModelCatalog(), GEMINI_OMNI_12_MODEL_ID, { status: "hidden" }));
    render([take()], "kling:kling-3-0-omni");
    expect(state.picker?.modelId).toBe(GEMINI_OMNI_11_MODEL_ID);
    expect(state.picker?.ownModelId).toBe("kling:kling-3-0-omni");
  });

  it("keeps a hidden Omni 1.2 on a take last edited with it, and tells the picker so", () => {
    state.videos = videoModelsFrom(withModel(seededModelCatalog(), GEMINI_OMNI_12_MODEL_ID, { status: "hidden" }));
    const edited = take({
      videoEdit: {
        baseVersionId: "v2", rootVersionId: "v1", instruction: "i", editPrompt: "e",
        referenceNodeIds: [], referenceUrls: [], resolution: "720p", modelId: GEMINI_OMNI_12_MODEL_ID,
      },
    });
    render([edited], "kling:kling-3-0-omni");
    expect(state.picker?.modelId).toBe(GEMINI_OMNI_12_MODEL_ID);
    expect(state.picker?.ownModelId).toBe(GEMINI_OMNI_12_MODEL_ID);
  });
});
