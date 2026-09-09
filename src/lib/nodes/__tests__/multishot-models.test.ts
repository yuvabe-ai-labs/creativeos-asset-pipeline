import { describe, it, expect } from "vitest";
import {
  MULTISHOT_MODELS,
  DEFAULT_MULTISHOT_MODEL,
  multishotCapabilityFor,
  checkLadder,
  multishotRestrictionReason,
  restrictionSentenceFor,
  MultishotCapability,
} from "../multishot-models";
import { videoGenClientModelMap, GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const cuts = (...secs: number[]) => secs.map((seconds, i) => ({ id: `c${i}`, text: "", seconds }));

describe("multishotCapabilityFor", () => {
  it("resolves each declared model", () => {
    expect(multishotCapabilityFor(GEMINI_OMNI_MODEL_ID).maxTotalSeconds).toBe(10);
    expect(multishotCapabilityFor(KLING_OMNI_MODEL_ID).maxTotalSeconds).toBe(15);
  });

  // Absent = every Multishot node that existed before targetModel did. There is no migration, so
  // this fallback IS the migration.
  it("falls back to Omni for absent, null and unknown ids", () => {
    expect(multishotCapabilityFor(undefined).id).toBe(DEFAULT_MULTISHOT_MODEL);
    expect(multishotCapabilityFor(null).id).toBe(DEFAULT_MULTISHOT_MODEL);
    expect(multishotCapabilityFor("kling:deleted-model").id).toBe(DEFAULT_MULTISHOT_MODEL);
  });

  // A capability naming a model that cannot be generated is a dead end the operator only meets
  // at Generate. Nothing else in the codebase would catch it.
  it("every capability names a real video-gen model", () => {
    for (const cap of MULTISHOT_MODELS) {
      expect(videoGenClientModelMap[cap.id], `${cap.id} is not a video-gen model`).toBeDefined();
    }
  });

  it("declares Kling's hard limits", () => {
    const kling = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
    expect(kling.maxCuts).toBe(6);
    expect(kling.maxCutChars).toBe(512);
    expect(kling.maxPromptChars).toBe(3072);
    expect(kling.shotFormat).toBe("triple");
    expect(kling.refTokenBase).toBe(1);
  });

  it("declares Omni's absent limits as null, not as a large number", () => {
    const omni = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
    expect(omni.maxCuts).toBeNull();
    expect(omni.maxCutChars).toBeNull();
    expect(omni.maxPromptChars).toBeNull();
    expect(omni.shotFormat).toBe("timecode");
    expect(omni.refTokenBase).toBe(0);
  });
});

describe("checkLadder", () => {
  const omni = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
  const kling = multishotCapabilityFor(KLING_OMNI_MODEL_ID);

  it("accepts a ladder inside the window", () => {
    expect(checkLadder(cuts(3, 3, 3), omni)).toEqual({ ok: true });
  });

  // The switch case from D237: the same ladder is legal on one model and not the other, and
  // switching must not silently rewrite it.
  it("accepts 14s on Kling and refuses it on Omni", () => {
    expect(checkLadder(cuts(7, 7), kling)).toEqual({ ok: true });
    const refused = checkLadder(cuts(7, 7), omni);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain("10s");
  });

  it("refuses a ladder under the floor", () => {
    expect(checkLadder(cuts(1, 1), omni).ok).toBe(false);
  });

  it("refuses more cuts than the model allows, naming both numbers", () => {
    const refused = checkLadder(cuts(1, 1, 1, 1, 1, 1, 1), kling);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toContain("7");
      expect(refused.reason).toContain("6");
    }
  });

  it("does not cap cuts on a model that states no limit", () => {
    expect(checkLadder(cuts(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), omni)).toEqual({ ok: true });
  });

  it("refuses a cut under the model's floor", () => {
    expect(checkLadder([{ seconds: 0 }, { seconds: 5 }], omni).ok).toBe(false);
  });

  it("refuses an empty ladder rather than calling it 0s", () => {
    expect(checkLadder([], omni).ok).toBe(false);
  });
});

describe("multishotRestrictionReason", () => {
  it("names the plan's model and offers the other one", () => {
    const forKling = multishotRestrictionReason(KLING_OMNI_MODEL_ID);
    expect(forKling).toContain("Kling 3.0 Omni");
    expect(forKling).toContain("Gemini Omni 1.1");
    expect(forKling).toContain("regenerate");
  });

  // Reads correctly BOTH ways round. A sentence built by hand for one direction reads as correct
  // while being exactly backwards in the other, and nothing but this test would catch it.
  it("swaps the two names when the plan is for Omni", () => {
    const forOmni = multishotRestrictionReason(GEMINI_OMNI_MODEL_ID);
    expect(forOmni).toContain("written for Gemini Omni 1.1");
    expect(forOmni).toContain("Kling 3.0 Omni");
    expect(forOmni).not.toContain("written for Kling");
  });

  // With a third model the sentence must not name only one alternative as if it were the only one.
  // This is tested via restrictionSentenceFor with a synthetic third model, exercising the
  // multi-alternative branch before it actually exists in production.
  it("points at the Multishot node when there are more than two models", () => {
    const syntheticThird: MultishotCapability = {
      ...multishotCapabilityFor(GEMINI_OMNI_MODEL_ID),
      id: "test:third-model",
      label: "Test Third Model",
    };
    const cap = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
    const others = [multishotCapabilityFor(GEMINI_OMNI_MODEL_ID), syntheticThird];

    const sentence = restrictionSentenceFor(cap, others);

    expect(sentence).toContain("Multishot node");
    expect(sentence).not.toContain("Gemini Omni 1.1");
    expect(sentence).not.toContain("Test Third Model");
  });
});
