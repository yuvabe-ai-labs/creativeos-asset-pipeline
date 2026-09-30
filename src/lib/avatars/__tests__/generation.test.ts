import { describe, it, expect } from "vitest";
import {
  avatarEngineNote, avatarImageParams, buildAvatarFrontPrompt, buildAvatarSheetPrompt,
  estimateAvatarImageCostUsd, estimateAvatarImageCredits, groupCandidatesByBatch,
  isSeedanceFaceModel, mergeCandidates,
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

describe("avatarEngineNote", () => {
  it("a real person runs on Gemini Omni, and the row is done", () => {
    expect(avatarEngineNote(makeAvatar())).toEqual({ text: "Gemini Omni · clips up to 10 s", ok: true });
  });

  it("a generated Seedream face runs on Seedance, and the row is done", () => {
    const avatar = makeAvatar({ personType: "generic", front: makeImage(GENERATED) });
    expect(avatarEngineNote(avatar)).toEqual({ text: "Seedance · clips up to 30 s", ok: true });
  });

  it("a face generated on another model is called out, names the required model by its live " +
    "label, and the row is NOT done — it is a warning, not a fact", () => {
    // GENERATED is typed as the AvatarImageSource union, so a spread needs the kind narrowed
    // first — otherwise TS can't tell the override still matches the "generated" variant's shape.
    const source = GENERATED.kind === "generated"
      ? { ...GENERATED, modelId: "gemini:gemini-3-pro-image" }
      : GENERATED;
    const front = makeImage(source);
    const note = avatarEngineNote(makeAvatar({ personType: "generic", front }));
    expect(note?.ok).toBe(false);
    expect(note?.text).toMatch(/Seedance will not accept/);
    expect(note?.text).toContain("Seedream 5.0 Lite");
  });

  it("says nothing before there is a front image", () => {
    expect(avatarEngineNote(makeAvatar({ front: null, personType: null }))).toBeNull();
  });
});
