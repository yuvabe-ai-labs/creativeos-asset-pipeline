import { describe, it, expect } from "vitest";
import {
  areFramesAndRefsExclusive,
  evaluateConstraints,
  reconcileLockedParams,
  reconcileRolesWithRules,
} from "../constraints";
import { videoGenClientModelMap } from "../client-models";

// Drives the "or" the spine shows between the frame slots and the reference slot, so the
// either/or is visible before anything is assigned rather than discovered by being blocked.
describe("areFramesAndRefsExclusive", () => {
  it("is true for a model whose rules block each side with the other", () => {
    expect(areFramesAndRefsExclusive(videoGenClientModelMap["veo:veo-3.1-fast"].rules)).toBe(true);
    expect(areFramesAndRefsExclusive(videoGenClientModelMap["veo:veo-3.1"].rules)).toBe(true);
  });

  it("is false for Kling O1, which accepts frames and references together", () => {
    expect(areFramesAndRefsExclusive(videoGenClientModelMap["kling:kling-o1"].rules)).toBe(false);
  });

  // Veo Lite has no reference capability at all — nothing to be exclusive WITH.
  it("is false for a model with no reference capability", () => {
    expect(areFramesAndRefsExclusive(videoGenClientModelMap["veo:veo-3.1-lite"].rules)).toBe(false);
  });

  it("is false when the model declares no rules", () => {
    expect(areFramesAndRefsExclusive(undefined)).toBe(false);
  });
});

// The combination the UI used to build for itself: switching to a refs-capable model kept the
// existing start/end frames AND auto-assigned references, producing a set Veo's rules can never
// satisfy — which the API then rejected at generate time.
// What drives the spine's "FIXED" badge: it appears exactly when a rule pins duration. Pinning
// it, on Veo, comes from EITHER side of the either/or — an end frame or a reference image — so
// these pin down both paths and the cases that must stay free.
describe("duration locking (drives the FIXED badge)", () => {
  const durationOf = (modelKey: string, state: Partial<Parameters<typeof evaluateConstraints>[1]>) =>
    evaluateConstraints(videoGenClientModelMap[modelKey].rules, {
      params: {},
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 0,
      ...state,
    }).lockedParams.duration;

  it("pins duration when start + end frames are set", () => {
    expect(durationOf("veo:veo-3.1", { hasStartFrame: true, hasEndFrame: true })).toBe("8");
    expect(durationOf("veo:veo-3.1-fast", { hasStartFrame: true, hasEndFrame: true })).toBe("8");
    expect(durationOf("veo:veo-3.1-lite", { hasStartFrame: true, hasEndFrame: true })).toBe("8");
  });

  it("pins duration when a reference image is set", () => {
    expect(durationOf("veo:veo-3.1", { referenceCount: 1 })).toBe("8");
    expect(durationOf("veo:veo-3.1-fast", { referenceCount: 2 })).toBe("8");
  });

  // A start frame on its own interpolates nothing and constrains nothing — the full menu stays
  // open, so no badge.
  it("leaves duration free with only a start frame", () => {
    expect(durationOf("veo:veo-3.1", { hasStartFrame: true })).toBeUndefined();
  });

  it("leaves duration free when no roles are assigned", () => {
    expect(durationOf("veo:veo-3.1", {})).toBeUndefined();
  });

  // Kling's end-frame rule pins multi_shot, not duration — so no badge there, correctly.
  it("does not pin duration on Kling, whose end-frame rule targets multi_shot", () => {
    expect(durationOf("kling:kling-3-0", { hasStartFrame: true, hasEndFrame: true })).toBeUndefined();
    expect(durationOf("kling:kling-o1", { hasStartFrame: true, hasEndFrame: true })).toBeUndefined();
  });
});

describe("reconcileRolesWithRules", () => {
  const veoFast = videoGenClientModelMap["veo:veo-3.1-fast"];
  const klingO1 = videoGenClientModelMap["kling:kling-o1"];

  it("drops references when a model's rules block frames and refs mutually", () => {
    const roles = {
      a: "start_frame",
      b: "end_frame",
      c: "reference",
    } as const;

    expect(reconcileRolesWithRules(veoFast.rules, roles, {})).toEqual({
      a: "start_frame",
      b: "end_frame",
    });
  });

  it("leaves a refs-only assignment alone — one rule firing is the rule working", () => {
    const roles = { c: "reference", d: "reference" } as const;
    expect(reconcileRolesWithRules(veoFast.rules, roles, {})).toEqual(roles);
  });

  it("leaves a frames-only assignment alone", () => {
    const roles = { a: "start_frame", b: "end_frame" } as const;
    expect(reconcileRolesWithRules(veoFast.rules, roles, {})).toEqual(roles);
  });

  // Kling O1 declares no exclusion rule, so the same combination is legal there. This is why
  // the check reads the rules instead of hardcoding "frames and refs are exclusive".
  it("keeps start + end + references on a model with no exclusion rule", () => {
    const roles = {
      a: "start_frame",
      b: "end_frame",
      c: "reference",
    } as const;
    expect(reconcileRolesWithRules(klingO1.rules, roles, {})).toEqual(roles);
  });

  it("passes through when the model has no rules at all", () => {
    const roles = { a: "start_frame", c: "reference" } as const;
    expect(reconcileRolesWithRules(undefined, roles, {})).toEqual(roles);
  });
});

// D98 — the params panel displayed lockedParams while leaving `params` untouched, and the
// disabled control could never reconcile them. `params` is what gets posted, so the UI showed
// a locked 8 and sent 6. This helper is the single source of truth for closing that gap.
describe("reconcileLockedParams", () => {
  it("returns merged params when a locked value diverges from state", () => {
    expect(reconcileLockedParams({ duration: "6" }, { duration: "8" })).toEqual({
      duration: "8",
    });
  });

  it("preserves unlocked params while overriding locked ones", () => {
    expect(
      reconcileLockedParams({ duration: "6", aspect_ratio: "9:16" }, { duration: "8" }),
    ).toEqual({ duration: "8", aspect_ratio: "9:16" });
  });

  it("fills in a locked param that is missing from state entirely", () => {
    expect(reconcileLockedParams({}, { duration: "8" })).toEqual({ duration: "8" });
  });

  // Null returns let the caller early-out of an effect rather than setting state every render.
  it("returns null when nothing is locked", () => {
    expect(reconcileLockedParams({ duration: "6" }, {})).toBeNull();
  });

  it("returns null when state already matches the locked values", () => {
    expect(reconcileLockedParams({ duration: "8" }, { duration: "8" })).toBeNull();
  });

  it("handles non-string locked values", () => {
    expect(reconcileLockedParams({ multi_shot: true }, { multi_shot: false })).toEqual({
      multi_shot: false,
    });
    expect(reconcileLockedParams({ multi_shot: false }, { multi_shot: false })).toBeNull();
  });

  it("does not mutate the params it was given", () => {
    const params = { duration: "6" };
    reconcileLockedParams(params, { duration: "8" });
    expect(params).toEqual({ duration: "6" });
  });
});
