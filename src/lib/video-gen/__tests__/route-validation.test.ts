import { describe, it, expect } from "vitest";
import { validateAgainstRules } from "../constraints";
import { videoGenClientModelMap } from "../client-models";

const veoRefs = videoGenClientModelMap["veo:veo-3.1-fast"].rules;
const kling30 = videoGenClientModelMap["kling:kling-3-0"].rules;

// D97 — the server rejects, it never corrects. Auto-correcting would silently change both what
// the caller asked for and what they are billed.
describe("validateAgainstRules", () => {
  // The exact shape of the 13 observed Veo failures: references with duration 4 or 6.
  it("rejects Veo references with a duration other than 8", () => {
    const reason = validateAgainstRules(veoRefs, {
      params: { duration: "6" },
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 3,
    });
    expect(reason).toMatch(/8s/);
  });

  it("accepts Veo references at duration 8", () => {
    expect(
      validateAgainstRules(veoRefs, {
        params: { duration: "8" },
        hasStartFrame: false,
        hasEndFrame: false,
        referenceCount: 3,
      }),
    ).toBeNull();
  });

  it("rejects a Veo end frame with no start frame", () => {
    const reason = validateAgainstRules(veoRefs, {
      params: { duration: "8" },
      hasStartFrame: false,
      hasEndFrame: true,
      referenceCount: 0,
    });
    expect(reason).toMatch(/start frame/i);
  });

  it("rejects a Kling request with no start frame", () => {
    const reason = validateAgainstRules(kling30, {
      params: {},
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 0,
    });
    expect(reason).toMatch(/start frame/i);
  });

  it("rejects a Kling end frame with multi_shot still on", () => {
    const reason = validateAgainstRules(kling30, {
      params: { multi_shot: true },
      hasStartFrame: true,
      hasEndFrame: true,
      referenceCount: 0,
    });
    expect(reason).toMatch(/multi-shot/i);
  });

  it("accepts a legal Kling request", () => {
    expect(
      validateAgainstRules(kling30, {
        params: { multi_shot: false },
        hasStartFrame: true,
        hasEndFrame: true,
        referenceCount: 0,
      }),
    ).toBeNull();
  });

  it("returns null when a model has no rules", () => {
    expect(
      validateAgainstRules([], {
        params: {},
        hasStartFrame: true,
        hasEndFrame: false,
        referenceCount: 0,
      }),
    ).toBeNull();
  });

  it("returns null when rules are undefined", () => {
    expect(
      validateAgainstRules(undefined, {
        params: {},
        hasStartFrame: true,
        hasEndFrame: false,
        referenceCount: 0,
      }),
    ).toBeNull();
  });
});
