import { describe, it, expect } from "vitest";
import { smartMergeVideoParams } from "../params/merge";
import {
  videoGenClientModelMap,
  defaultsForVideoModel,
  GEMINI_OMNI_11_MODEL_ID,
  GEMINI_OMNI_12_MODEL_ID,
  KLING_OMNI_MODEL_ID,
} from "../client-models";

const OMNI_11 = videoGenClientModelMap[GEMINI_OMNI_11_MODEL_ID];
const OMNI_12 = videoGenClientModelMap[GEMINI_OMNI_12_MODEL_ID];
const KLING = videoGenClientModelMap[KLING_OMNI_MODEL_ID];

describe("smartMergeVideoParams", () => {
  const custom = { resolution: "1080p", duration: 9, aspect_ratio: "16:9", negative_prompt: "no rain" };

  // D486 — switching Omni versions keeps what the operator wrote.
  it("keeps every value, the negative prompt included, between Omni 1.1 and 1.2", () => {
    expect(smartMergeVideoParams(custom, OMNI_12, GEMINI_OMNI_11_MODEL_ID)).toEqual(custom);
    expect(smartMergeVideoParams(custom, OMNI_11, GEMINI_OMNI_12_MODEL_ID)).toEqual(custom);
  });

  it("clamps 1.2's 15s to 1.1's 10s rather than resetting it", () => {
    expect(smartMergeVideoParams({ ...custom, duration: 15 }, OMNI_11, GEMINI_OMNI_12_MODEL_ID).duration).toBe(10);
  });

  // Across providers each provider's tuned negative default still wins.
  it("resets free text to the new provider's default across providers", () => {
    const next = smartMergeVideoParams(custom, KLING, GEMINI_OMNI_12_MODEL_ID);
    expect(next.negative_prompt).toBe(defaultsForVideoModel(KLING_OMNI_MODEL_ID).negative_prompt);
  });

  it("resets free text when the previous model is unknown, as before", () => {
    const next = smartMergeVideoParams(custom, OMNI_11);
    expect(next.negative_prompt).toBe(defaultsForVideoModel(GEMINI_OMNI_11_MODEL_ID).negative_prompt);
  });
});
