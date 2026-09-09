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
import { videoGenClientModelMap, GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID, SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";

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

  it("declares Seedance's 4-30s window — the first floor that is not 3", () => {
    const sd = multishotCapabilityFor(SEEDANCE_MODEL_ID);
    expect(sd.minTotalSeconds).toBe(4);
    expect(sd.maxTotalSeconds).toBe(30);
    expect(sd.shotFormat).toBe("bare-timecode");
    expect(sd.refTokenDialect).toBe("seedance-image");
  });

  it("gives every capability a distinct reference dialect", () => {
    const dialects = MULTISHOT_MODELS.map((m) => m.refTokenDialect);
    expect(new Set(dialects).size).toBe(MULTISHOT_MODELS.length);
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

  it("refuses a 3s ladder on Seedance that Omni accepts", () => {
    const cuts = [{ seconds: 3 }];
    expect(checkLadder(cuts, multishotCapabilityFor(GEMINI_OMNI_MODEL_ID))).toEqual({ ok: true });
    expect(checkLadder(cuts, multishotCapabilityFor(SEEDANCE_MODEL_ID)).ok).toBe(false);
  });

  it("accepts a 30s ladder only on Seedance", () => {
    const cuts = Array.from({ length: 6 }, () => ({ seconds: 5 }));
    expect(checkLadder(cuts, multishotCapabilityFor(SEEDANCE_MODEL_ID))).toEqual({ ok: true });
    expect(checkLadder(cuts, multishotCapabilityFor(KLING_OMNI_MODEL_ID)).ok).toBe(false);
  });
});

describe("multishotRestrictionReason", () => {
  // With three models, the sentence uses the multi-alternative branch and points at the node
  // rather than naming a specific alternative.
  it("points at the Multishot node when there are more than two models", () => {
    const forKling = multishotRestrictionReason(KLING_OMNI_MODEL_ID);
    expect(forKling).toContain("Kling 3.0 Omni");
    expect(forKling).toContain("Multishot node");
    expect(forKling).toContain("regenerate");
  });

  // Reads correctly with Seedance as the third model.
  it("names the plan's model with three models in the system", () => {
    const forOmni = multishotRestrictionReason(GEMINI_OMNI_MODEL_ID);
    expect(forOmni).toContain("written for Gemini Omni 1.1");
    expect(forOmni).toContain("Multishot node");
    expect(forOmni).not.toContain("written for Kling");
  });

  // With a synthetic third model passed explicitly, this tests the multi-alternative branch
  // behavior in isolation.
  it("points at the Multishot node in the multi-alternative case", () => {
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
