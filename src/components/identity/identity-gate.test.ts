import { describe, it, expect } from "vitest";
import { needsIdentityGate } from "./gate-logic";

describe("needsIdentityGate", () => {
  it("gates when identity is null", () => {
    expect(needsIdentityGate(null)).toBe(true);
  });
  it("does not gate when identity is set", () => {
    expect(needsIdentityGate({ name: "Asha", role: "senior" })).toBe(false);
  });
});
