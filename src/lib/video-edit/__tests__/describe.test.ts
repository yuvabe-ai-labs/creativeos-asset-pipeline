import { describe, it, expect } from "vitest";
import { describeVideoEdit } from "../describe";

const inputsUsed = {
  videoEdit: {
    baseVersionId: "v3", rootVersionId: "v1", instruction: "Make the flour beige", editPrompt: "…",
    referenceNodeIds: ["a", "b"], referenceUrls: ["u1", "u2"], resolution: "1080p",
  },
};

describe("describeVideoEdit", () => {
  it("titles an edited version and says what it came from", () => {
    expect(describeVideoEdit(inputsUsed, new Map([["v3", "v3"]]))).toEqual({
      title: "Edit: Make the flour beige",
      detail: "edited from v3 · 2 references · 1080p",
    });
  });
  it("is null for a version that isn't an edit", () => {
    expect(describeVideoEdit({ prompt: "p" }, new Map())).toBeNull();
    expect(describeVideoEdit(undefined, new Map())).toBeNull();
  });
  it("falls back when the base version is gone and has one reference", () => {
    const one = { videoEdit: { ...inputsUsed.videoEdit, referenceNodeIds: ["a"], referenceUrls: ["u1"] } };
    expect(describeVideoEdit(one, new Map())?.detail).toBe("edited from an earlier version · 1 reference · 1080p");
  });
});
