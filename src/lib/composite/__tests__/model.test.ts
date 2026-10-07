import { describe, it, expect } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import {
  COMPOSITE_DEFAULT_MODEL_ID,
  COMPOSITE_MODEL_IDS,
  COMPOSITE_ASPECT_RATIOS,
  compositeModelNote,
  resolveCompositeModelId,
  clampCompositeParams,
  compositePickerModelId,
} from "../model";

describe("composite model (D312)", () => {
  it("defaults to the model Seedance takes faces from", () => {
    expect(COMPOSITE_DEFAULT_MODEL_ID).toBe(SEEDANCE_FACE_MODEL_ID);
  });

  it("the operator's choice wins, avatar or not; nothing stored means the default", () => {
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image")).toBe("gemini:gemini-3-pro-image");
    expect(resolveCompositeModelId(undefined)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
  });

  it("offers three models — one per provider, the default among them", () => {
    expect(COMPOSITE_MODEL_IDS).toEqual(["openai:gpt-image-2", "gemini:gemini-3.1-flash-image", SEEDANCE_FACE_MODEL_ID]);
  });

  it("the picker shows a stored model it no longer offers as the default", () => {
    expect(compositePickerModelId("gemini:gemini-2.5-flash-image")).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId("openai:gpt-image-2")).toBe("openai:gpt-image-2");
    expect(compositePickerModelId(undefined)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
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
});

