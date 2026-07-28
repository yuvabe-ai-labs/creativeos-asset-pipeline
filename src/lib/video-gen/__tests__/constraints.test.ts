import { describe, it, expect } from "vitest";
import { reconcileLockedParams } from "../constraints";

// D86 — the params panel displayed lockedParams while leaving `params` untouched, and the
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
