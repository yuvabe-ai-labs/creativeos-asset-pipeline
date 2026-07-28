import { describe, it, expect } from "vitest";
import { evaluateConstraints } from "../constraints";
import { videoGenClientModelMap } from "../client-models";
import type { ConstraintState } from "../types";

function state(over: Partial<ConstraintState> = {}): ConstraintState {
  return {
    params: {},
    hasStartFrame: true,
    hasEndFrame: false,
    referenceCount: 0,
    ...over,
  };
}

describe("Kling constraint rules", () => {
  // Previously this surfaced only as a throw inside the Trigger task — a generation that
  // failed minutes later. As a rule it disables Generate up front.
  it("blocks generation when no start frame is assigned", () => {
    for (const id of ["kling:kling-3-0", "kling:kling-o1"]) {
      const rules = videoGenClientModelMap[id].rules;
      const result = evaluateConstraints(rules, state({ hasStartFrame: false }));
      expect(result.disableGenerate).toBe(true);
      expect(result.disableGenerateReason).toMatch(/start frame/i);
    }
  });

  it("allows generation once a start frame is assigned", () => {
    for (const id of ["kling:kling-3-0", "kling:kling-o1"]) {
      const rules = videoGenClientModelMap[id].rules;
      expect(evaluateConstraints(rules, state()).disableGenerate).toBe(false);
    }
  });

  // Multi-shot cuts between shots; an end frame asks for one continuous interpolated path.
  it("locks multi_shot off on Kling 3.0 when an end frame is set", () => {
    const rules = videoGenClientModelMap["kling:kling-3-0"].rules;
    const result = evaluateConstraints(rules, state({ hasEndFrame: true }));
    expect(result.lockedParams.multi_shot).toBe(false);
    expect(result.lockedParamReasons.multi_shot).toMatch(/multi-shot/i);
  });

  it("leaves multi_shot unlocked on 3.0 without an end frame", () => {
    const rules = videoGenClientModelMap["kling:kling-3-0"].rules;
    const result = evaluateConstraints(rules, state({ hasEndFrame: false }));
    expect(result.lockedParams).not.toHaveProperty("multi_shot");
  });

  it("does not lock multi_shot on O1, which has no such param", () => {
    const rules = videoGenClientModelMap["kling:kling-o1"].rules;
    const result = evaluateConstraints(rules, state({ hasEndFrame: true }));
    expect(result.lockedParams).not.toHaveProperty("multi_shot");
  });
});

describe("Kling reference capability", () => {
  // 7-image omni budget less both frames, conservatively — the docs do not say whether
  // first_frame/last_frame count toward the 7.
  it("O1 accepts references, 3.0 does not", () => {
    expect(videoGenClientModelMap["kling:kling-o1"].imageInputs.maxReferenceImages).toBe(5);
    expect(videoGenClientModelMap["kling:kling-3-0"].imageInputs.maxReferenceImages).toBe(0);
  });

  it("both Kling models still accept start and end frames", () => {
    for (const id of ["kling:kling-3-0", "kling:kling-o1"]) {
      expect(videoGenClientModelMap[id].imageInputs.startFrame).toBe(true);
      expect(videoGenClientModelMap[id].imageInputs.endFrame).toBe(true);
    }
  });
});
