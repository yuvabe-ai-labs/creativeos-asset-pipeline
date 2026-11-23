import { describe, it, expect } from "vitest";
import { describeVideoEdit } from "../describe";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";

const videos = videoModelsFrom(seededModelCatalog());

const inputsUsed = {
  videoEdit: {
    baseVersionId: "v3", rootVersionId: "v1", instruction: "Make the flour beige", editPrompt: "…",
    referenceNodeIds: ["a", "b"], referenceUrls: ["u1", "u2"], resolution: "1080p",
  },
};

describe("describeVideoEdit", () => {
  it("titles an edited version and says what it came from", () => {
    expect(describeVideoEdit(videos, inputsUsed, new Map([["v3", "v3"]]))).toEqual({
      title: "Edit: Make the flour beige",
      detail: "edited from v3 · 2 references · 1080p",
    });
  });
  it("names the model when the edit recorded one", () => {
    const withModel = { videoEdit: { ...inputsUsed.videoEdit, modelId: "gemini:gemini-omni-1.2-flash" } };
    expect(describeVideoEdit(videos, withModel, new Map([["v3", "v3"]]))?.detail).toBe("edited from v3 · Omni 1.2 · 2 references · 1080p");
  });
  it("is null for a version that isn't an edit", () => {
    expect(describeVideoEdit(videos, { prompt: "p" }, new Map())).toBeNull();
    expect(describeVideoEdit(videos, undefined, new Map())).toBeNull();
  });
  it("falls back when the base version is gone and has one reference", () => {
    const one = { videoEdit: { ...inputsUsed.videoEdit, referenceNodeIds: ["a"], referenceUrls: ["u1"] } };
    expect(describeVideoEdit(videos, one, new Map())?.detail).toBe("edited from an earlier version · 1 reference · 1080p");
  });
});
