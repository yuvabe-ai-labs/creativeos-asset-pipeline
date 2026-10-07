import { describe, it, expect } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import { COMPOSITE_DEFAULT_MODEL_ID, compositeModelNote, resolveCompositeModelId } from "../model";

describe("composite model (D312)", () => {
  it("defaults to the model Seedance takes faces from", () => {
    expect(COMPOSITE_DEFAULT_MODEL_ID).toBe(SEEDANCE_FACE_MODEL_ID);
  });

  it("the operator's choice wins, avatar or not; nothing stored means the default", () => {
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image")).toBe("gemini:gemini-3-pro-image");
    expect(resolveCompositeModelId(undefined)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
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
});
