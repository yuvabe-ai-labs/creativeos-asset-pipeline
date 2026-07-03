import { describe, it, expect } from "vitest";
import { needsIdentityGate } from "./gate-logic";

describe("needsIdentityGate", () => {
  it("does NOT gate before hydration, even with no identity yet", () => {
    // Before localStorage is read, identity is null only because we haven't
    // checked yet — not because it's empty. Gating here caused the open→close
    // flash that stranded the Base UI dialog (see D29 debugging).
    expect(needsIdentityGate(null, false)).toBe(false);
  });

  it("gates once hydrated and identity is genuinely empty", () => {
    expect(needsIdentityGate(null, true)).toBe(true);
  });

  it("does not gate when identity is set (hydrated)", () => {
    expect(needsIdentityGate({ name: "Asha", role: "senior" }, true)).toBe(false);
  });

  it("does not gate when identity is set but not yet marked hydrated", () => {
    // Defensive: a present identity should never gate regardless of the flag.
    expect(needsIdentityGate({ name: "Asha", role: "senior" }, false)).toBe(false);
  });
});
