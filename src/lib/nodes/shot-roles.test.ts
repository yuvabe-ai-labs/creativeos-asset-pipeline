import { describe, it, expect } from "vitest";
import { SHOT_ROLES, DEFAULT_SHOT_ROLE, getShotRole } from "@/lib/nodes/shot-roles";

describe("shot-roles catalog", () => {
  it("has the 10 report roles, each with non-empty slots and avoid", () => {
    const keys = SHOT_ROLES.map((r) => r.key);
    expect(keys).toEqual([
      "hook", "hero", "texture", "application", "ingredient",
      "tutorial", "lifestyle", "social-proof", "bundle", "closure",
    ]);
    for (const r of SHOT_ROLES) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.slots.length).toBeGreaterThan(0);
      expect(r.avoid.length).toBeGreaterThan(0);
    }
  });

  it("keys are unique", () => {
    const keys = SHOT_ROLES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("getShotRole returns the role, or the default for an unknown key", () => {
    expect(getShotRole("texture").key).toBe("texture");
    expect(getShotRole("nonsense").key).toBe(DEFAULT_SHOT_ROLE);
    expect(SHOT_ROLES.some((r) => r.key === DEFAULT_SHOT_ROLE)).toBe(true);
  });
});
