import { describe, it, expect } from "vitest";
import {
  avatarImageParams, avatarWorksWith, buildAvatarFrontPrompt, buildAvatarViewPrompt,
  estimateSheetCredits,
  estimateAvatarImageCostUsd, estimateAvatarImageCredits, groupCandidatesByBatch,
  imageModelWorksWith, isSeedanceFaceModel, listSentence, mergeCandidates,
} from "../generation";
import {
  AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_FRAMING_CLAUSE, AVATAR_FRONT_ASPECT,
  AVATAR_SHEET_ASPECT, SEEDANCE_FACE_MODEL_ID,
} from "../constants";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";
import type { AvatarCandidate } from "../schema";

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

describe("buildAvatarViewPrompt (D340)", () => {
  it("states which edge of the frame each profile faces, so the two never face the same way", () => {
    expect(buildAvatarViewPrompt("left")).toContain("nose points to the LEFT edge");
    expect(buildAvatarViewPrompt("right")).toContain("nose points to the RIGHT edge");
    expect(buildAvatarViewPrompt("back")).toContain("facing directly away");
    expect(buildAvatarViewPrompt("front")).toContain("facing the camera");
  });

  it("asks for the same person, head to toe, on a plain backdrop, with no text", () => {
    for (const view of ["front", "left", "right", "back"] as const) {
      const prompt = buildAvatarViewPrompt(view);
      expect(prompt).toContain("same person as the reference image");
      expect(prompt).toContain("head to toe");
      expect(prompt).toContain("identity markers");
      expect(prompt).toContain("No text");
    }
  });
});

describe("estimateSheetCredits", () => {
  it("is one view's estimate times the number of views", () => {
    const one = estimateSheetCredits("gemini:gemini-3.1-flash-image", 1);
    expect(one).toBeGreaterThan(0);
    expect(estimateSheetCredits("gemini:gemini-3.1-flash-image", 4)).toBe(one! * 4);
    expect(estimateSheetCredits("nope:none", 4)).toBeNull();
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

const cand = (over: Partial<AvatarCandidate>): AvatarCandidate => ({
  generationId: "g1", batchId: "b1", url: "u1", modelId: SEEDANCE_FACE_MODEL_ID,
  createdAt: "2026-09-30T10:00:00.000Z", width: 3, height: 4, sizeBytes: 1, ...over,
});

describe("mergeCandidates", () => {
  it("adds new images, keeps one copy of a repeated one, newest first", () => {
    const a = cand({ generationId: "g1", createdAt: "2026-09-30T10:00:00.000Z" });
    const b = cand({ generationId: "g2", createdAt: "2026-09-30T10:05:00.000Z" });
    expect(mergeCandidates([a], [b, a]).map((c) => c.generationId)).toEqual(["g2", "g1"]);
  });
});

describe("groupCandidatesByBatch", () => {
  it("groups by batch, newest batch first, and counts images still generating", () => {
    const batches = groupCandidatesByBatch(
      [
        cand({ generationId: "g1", batchId: "old", createdAt: "2026-09-30T10:00:00.000Z" }),
        cand({ generationId: "g2", batchId: "new", createdAt: "2026-09-30T10:05:00.000Z" }),
      ],
      [{ key: "new-1", batchId: "new", modelId: SEEDANCE_FACE_MODEL_ID }],
    );
    expect(batches.map((b) => b.batchId)).toEqual(["new", "old"]);
    expect(batches[0]).toMatchObject({ pendingCount: 1, createdAt: "2026-09-30T10:05:00.000Z" });
    expect(batches[0].candidates).toHaveLength(1);
  });

  it("shows a batch that has only placeholders so far, ahead of finished ones", () => {
    const batches = groupCandidatesByBatch(
      [cand({ generationId: "g1", batchId: "old" })],
      [{ key: "p-0", batchId: "fresh", modelId: "gemini:gemini-3-pro-image" }],
    );
    expect(batches[0]).toMatchObject({
      batchId: "fresh", modelId: "gemini:gemini-3-pro-image", createdAt: null, pendingCount: 1,
    });
  });

  it("gives an image with no batch a group of its own", () => {
    const batches = groupCandidatesByBatch([cand({ generationId: "solo", batchId: null })], []);
    expect(batches).toHaveLength(1);
    expect(batches[0].candidates[0].generationId).toBe("solo");
  });
});

// D297 — which video models an avatar can be used with, by its face (spec §8).
describe("avatarWorksWith", () => {
  // GENERATED is typed as the AvatarImageSource union, so a spread needs the kind narrowed first.
  const otherModel = GENERATED.kind === "generated"
    ? { ...GENERATED, modelId: "gemini:gemini-3-pro-image" }
    : GENERATED;

  it("a Seedream face works with every model, Seedance included", () => {
    expect(avatarWorksWith(makeAvatar({ front: makeImage(GENERATED) })))
      .toEqual(["Seedance", "Gemini Omni", "Kling", "Veo"]);
  });
  it("a face from any other image model drops Seedance", () => {
    expect(avatarWorksWith(makeAvatar({ front: makeImage(otherModel) })))
      .toEqual(["Gemini Omni", "Kling", "Veo"]);
  });
  it("a real person's photo works on Gemini Omni and Kling — Seedance refuses it, Veo may", () => {
    expect(avatarWorksWith(makeAvatar())).toEqual(["Gemini Omni", "Kling"]);
  });
  it("names nothing before there is a front image", () => {
    expect(avatarWorksWith(makeAvatar({ front: null }))).toEqual([]);
  });
});

describe("imageModelWorksWith", () => {
  it("says, while the model is being chosen, what its faces will work with", () => {
    expect(imageModelWorksWith(SEEDANCE_FACE_MODEL_ID)).toContain("Seedance");
    expect(imageModelWorksWith("gemini:gemini-3-pro-image")).not.toContain("Seedance");
  });
});

describe("listSentence", () => {
  it("joins with commas and a final 'and'", () => {
    expect(listSentence([])).toBe("");
    expect(listSentence(["A"])).toBe("A");
    expect(listSentence(["A", "B"])).toBe("A and B");
    expect(listSentence(["A", "B", "C", "D"])).toBe("A, B, C and D");
  });
});
