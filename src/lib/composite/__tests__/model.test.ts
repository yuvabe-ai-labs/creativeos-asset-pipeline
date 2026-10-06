import { describe, it, expect } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import {
  COMPOSITE_DEFAULT_MODEL_ID,
  compositeModelLock,
  resolveCompositeModelId,
} from "../model";

describe("composite model (D310)", () => {
  it("defaults to the model Seedance takes faces from", () => {
    expect(COMPOSITE_DEFAULT_MODEL_ID).toBe(SEEDANCE_FACE_MODEL_ID);
  });

  it("locks to the Seedance face model only while an avatar is wired", () => {
    expect(compositeModelLock(true)).toBe(SEEDANCE_FACE_MODEL_ID);
    expect(compositeModelLock(false)).toBeNull();
  });

  it("an avatar overrides the stored model; without one the stored model wins", () => {
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image", true)).toBe(SEEDANCE_FACE_MODEL_ID);
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image", false)).toBe("gemini:gemini-3-pro-image");
    expect(resolveCompositeModelId(undefined, false)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
  });
});
