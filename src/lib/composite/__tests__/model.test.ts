import { describe, it, expect } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";
import {
  COMPOSITE_DEFAULT_MODEL_ID,
  COMPOSITE_ASPECT_RATIOS,
  compositeModelNote,
  resolveCompositeModelId,
  clampCompositeParams,
  compositePickerModelId,
  COMPOSITE_MODEL_HINTS,
} from "../model";

describe("composite model (D312)", () => {
  it("defaults to the model Seedance takes faces from", () => {
    expect(COMPOSITE_DEFAULT_MODEL_ID).toBe(SEEDANCE_FACE_MODEL_ID);
  });

  it("the operator's choice wins, avatar or not; nothing stored means the default", () => {
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image")).toBe("gemini:gemini-3-pro-image");
    expect(resolveCompositeModelId(undefined)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
  });

  const images = imageModelsFrom(seededModelCatalog());
  it("the picker keeps a stored model the composite may use, else the default", () => {
    expect(compositePickerModelId(images, "gemini:gemini-3-pro-image")).toBe("gemini:gemini-3-pro-image");
    expect(compositePickerModelId(images, "nope:nope")).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId(images, undefined)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId(images, "openai:gpt-image-1")).toBe(COMPOSITE_DEFAULT_MODEL_ID);
  });

  it("the picker keeps its own hidden model, and moves off a default that isn't live", () => {
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), COMPOSITE_DEFAULT_MODEL_ID, { status: "hidden" }));
    expect(compositePickerModelId(hidden, COMPOSITE_DEFAULT_MODEL_ID)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId(hidden, undefined)).toBe(hidden.defaultId);
  });

  it("every image model can make a composite's two aspect ratios", () => {
    for (const m of imageGenClientModels) {
      const ratio = m.params.find((p) => p.name === "aspect_ratio");
      const options = ratio?.constraints.type === "select" ? ratio.constraints.options : [];
      for (const r of COMPOSITE_ASPECT_RATIOS) expect(options, `${m.id} ${r}`).toContain(r);
    }
  });

  it("with an avatar, says a Seedream composite goes everywhere", () => {
    expect(compositeModelNote(SEEDANCE_FACE_MODEL_ID, true)).toBe(
      "Works with Seedance, Gemini Omni, Kling and Veo.",
    );
  });

  it("with an avatar, says a Nano Banana composite cannot go to Seedance", () => {
    expect(compositeModelNote("gemini:gemini-3-pro-image", true)).toBe(
      "Works with Gemini Omni, Kling and Veo — not Seedance.",
    );
  });

  it("says nothing without an avatar — there is no face to restrict", () => {
    expect(compositeModelNote("gemini:gemini-3-pro-image", false)).toBeNull();
  });

  it("offers only 16:9 and 9:16", () => {
    expect(COMPOSITE_ASPECT_RATIOS).toEqual(["16:9", "9:16"]);
  });

  it("clamps any other stored aspect ratio to 9:16, keeping the rest", () => {
    expect(clampCompositeParams({ aspect_ratio: "1:1", image_size: "2K" })).toEqual({ aspect_ratio: "9:16", image_size: "2K" });
    expect(clampCompositeParams({ aspect_ratio: "16:9" })).toEqual({ aspect_ratio: "16:9" });
    expect(clampCompositeParams({})).toEqual({ aspect_ratio: "9:16" });
  });

  it("Seedream's chip carries a hint: generic UGC, goes into Seedance; the others carry none", () => {
    expect(COMPOSITE_MODEL_HINTS[SEEDANCE_FACE_MODEL_ID]).toBe("Use this for generic UGC — its composite can go into Seedance.");
    expect(Object.keys(COMPOSITE_MODEL_HINTS)).toEqual([SEEDANCE_FACE_MODEL_ID]);
  });
});

