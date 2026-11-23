import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, type ImageModels } from "@/lib/ai-models/model-lists";
import { VISUALISE_AVATAR_MODEL_ID } from "@/lib/scripts/visualise/constants";
import { linkedDoc, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

const state = vi.hoisted(() => ({ images: null as unknown as ImageModels, modelIds: [] as string[] }));

vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => state.images,
}));
vi.mock("@/hooks/use-cast-avatar-maker", async (orig) => {
  const real = await orig<typeof import("@/hooks/use-cast-avatar-maker")>();
  return {
    ...real,
    useCastAvatarMaker: (args: Parameters<typeof real.useCastAvatarMaker>[0]) => {
      state.modelIds.push(args.modelId);
      return real.useCastAvatarMaker(args);
    },
  };
});

import { CastChip } from "../cast-chip";

const render = () => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <CastChip clientId="c1" scriptId={SCRIPT_ID} member={linkedDoc().cast[0]} avatar={null} faceUrl={null} takenIds={[]} />
  </QueryClientProvider>,
);

describe("CastChip avatar model (D543)", () => {
  beforeEach(() => { state.modelIds = []; });

  it("starts on the cast default while it is live", () => {
    state.images = imageModelsFrom(seededModelCatalog());
    render();
    expect(state.modelIds[0]).toBe(VISUALISE_AVATAR_MODEL_ID);
  });

  it("starts on the live fallback when the cast default is hidden", () => {
    state.images = imageModelsFrom(withModel(seededModelCatalog(), VISUALISE_AVATAR_MODEL_ID, { status: "hidden" }));
    render();
    expect(state.modelIds[0]).toBe(state.images.liveOr(VISUALISE_AVATAR_MODEL_ID));
    expect(state.modelIds[0]).not.toBe(VISUALISE_AVATAR_MODEL_ID);
  });
});
