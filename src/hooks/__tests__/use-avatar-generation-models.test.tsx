import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, type ImageModels } from "@/lib/ai-models/model-lists";
import { AVATAR_DEFAULT_FRONT_MODEL_ID, AVATAR_DEFAULT_SHEET_MODEL_ID } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";
import { useAvatarGeneration } from "../use-avatar-generation";

const state = vi.hoisted(() => ({ images: null as unknown as ImageModels }));
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => state.images,
}));

function starts(images: ImageModels): { front: string; sheet: string } {
  state.images = images;
  const out = { front: "", sheet: "" };
  function Probe() {
    const g = useAvatarGeneration({
      clientId: "c1", avatarId: null, ensureAvatar: async () => ({}) as Avatar, onAvatar: () => {},
    });
    out.front = g.composer.modelId;
    out.sheet = g.sheetModelId;
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return out;
}

describe("useAvatarGeneration model defaults (D566)", () => {
  it("starts on the Studio's defaults while they are live", () => {
    expect(starts(imageModelsFrom(seededModelCatalog()))).toEqual({
      front: AVATAR_DEFAULT_FRONT_MODEL_ID, sheet: AVATAR_DEFAULT_SHEET_MODEL_ID,
    });
  });

  it("starts on the live fallback when a default is hidden", () => {
    let catalog = withModel(seededModelCatalog(), AVATAR_DEFAULT_FRONT_MODEL_ID, { status: "hidden" });
    catalog = withModel(catalog, AVATAR_DEFAULT_SHEET_MODEL_ID, { status: "hidden" });
    const images = imageModelsFrom(catalog);
    const got = starts(images);
    expect(got.front).toBe(images.liveOr(AVATAR_DEFAULT_FRONT_MODEL_ID));
    expect(got.sheet).toBe(images.liveOr(AVATAR_DEFAULT_SHEET_MODEL_ID));
    expect(got.front).not.toBe(AVATAR_DEFAULT_FRONT_MODEL_ID);
    expect(got.sheet).not.toBe(AVATAR_DEFAULT_SHEET_MODEL_ID);
  });
});
