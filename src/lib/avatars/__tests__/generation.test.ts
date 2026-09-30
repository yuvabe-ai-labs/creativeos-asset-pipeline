import { describe, it, expect } from "vitest";
import {
  avatarImageParams, buildAvatarFrontPrompt, buildAvatarSheetPrompt,
  estimateAvatarImageCostUsd, estimateAvatarImageCredits, isSeedanceFaceModel,
} from "../generation";
import {
  AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_FRAMING_CLAUSE, AVATAR_FRONT_ASPECT,
  AVATAR_SHEET_ASPECT, SEEDANCE_FACE_MODEL_ID,
} from "../constants";

describe("buildAvatarFrontPrompt", () => {
  it("joins the description, the chosen attributes, the style and the fixed framing", () => {
    const prompt = buildAvatarFrontPrompt({
      description: "  Runs a small bakery, flour on her apron.  ",
      attributes: { gender: "Female", age: "25–34" },
      styleId: "photoreal",
    });
    expect(prompt.startsWith("Runs a small bakery, flour on her apron.")).toBe(true);
    expect(prompt).toContain("Female");
    expect(prompt).toContain("aged 25–34");
    expect(prompt).toContain("Photorealistic");
    expect(prompt.endsWith(AVATAR_FRAMING_CLAUSE)).toBe(true);
  });

  it("adds nothing for attributes that were not chosen", () => {
    const prompt = buildAvatarFrontPrompt({ description: "A chef.", attributes: {}, styleId: "3d" });
    expect(prompt).not.toContain("aged");
    expect(prompt).not.toContain("undefined");
  });
});

describe("buildAvatarSheetPrompt", () => {
  it("asks for three views of the same person in one image and names it a reference sheet", () => {
    const prompt = buildAvatarSheetPrompt();
    expect(prompt).toContain("three views");
    for (const view of ["front", "side profile", "back"]) expect(prompt).toContain(view);
    expect(prompt).not.toContain("three-quarter");
    expect(prompt).toContain("character reference sheet");
    expect(prompt).toContain("same person");
  });
});

describe("avatarImageParams", () => {
  it("uses the model's defaults with the aspect ratio forced", () => {
    const params = avatarImageParams(SEEDANCE_FACE_MODEL_ID, AVATAR_FRONT_ASPECT);
    expect(params).toMatchObject({ aspect_ratio: "3:4" });
    expect(params).toHaveProperty("image_size");
  });

  it("is null for a model that is not in the registry", () => {
    expect(avatarImageParams("nope:none", AVATAR_FRONT_ASPECT)).toBeNull();
  });
});

describe("estimates", () => {
  it("prices a Seedream front at its flat per-image rate, in credits", () => {
    const usd = estimateAvatarImageCostUsd({
      modelId: SEEDANCE_FACE_MODEL_ID, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0,
    });
    expect(usd).toBeCloseTo(0.035, 5);
    expect(estimateAvatarImageCredits({
      modelId: SEEDANCE_FACE_MODEL_ID, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0,
    })).toBe(35);
  });

  it("prices a sheet with one reference image above zero", () => {
    const credits = estimateAvatarImageCredits({
      modelId: AVATAR_DEFAULT_SHEET_MODEL_ID, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1,
    });
    expect(credits).toBeGreaterThan(0);
  });

  it("is null for an unknown model, so the caller can fail closed", () => {
    expect(estimateAvatarImageCredits({ modelId: "nope:none", aspect: "3:4", referenceCount: 0 })).toBeNull();
  });
});

describe("isSeedanceFaceModel", () => {
  it("is true only for the one model Seedance accepts", () => {
    expect(isSeedanceFaceModel(SEEDANCE_FACE_MODEL_ID)).toBe(true);
    expect(isSeedanceFaceModel("seedream:seedream-5-0-pro")).toBe(false);
    expect(isSeedanceFaceModel("gemini:gemini-3-pro-image")).toBe(false);
  });
});
