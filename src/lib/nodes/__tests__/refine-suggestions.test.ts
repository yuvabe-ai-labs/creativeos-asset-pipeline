import { describe, it, expect } from "vitest";
import { REFINE_SUGGESTIONS, type RefineScope } from "../refine-suggestions";

const SCOPES: RefineScope[] = ["all", "look", "cut"];

describe("REFINE_SUGGESTIONS", () => {
  it("covers every scope with unique, non-empty chips", () => {
    for (const scope of SCOPES) {
      const chips = REFINE_SUGGESTIONS[scope];
      expect(chips.length).toBeGreaterThan(2);
      expect(new Set(chips).size).toBe(chips.length);
      for (const chip of chips) expect(chip.trim()).not.toBe("");
    }
  });

  // Short enough to read as a chip rather than wrapping over three lines.
  it("keeps every chip short", () => {
    for (const scope of SCOPES) {
      for (const chip of REFINE_SUGGESTIONS[scope]) expect(chip.length).toBeLessThanOrEqual(30);
    }
  });

  // A steer names a change to a physical property the writer can act on. "Cinematic" is a mood
  // the model cannot execute — the same check LOOK_PRESETS already carries.
  it("carries no hype adjectives", () => {
    for (const scope of SCOPES) {
      for (const chip of REFINE_SUGGESTIONS[scope]) {
        expect(chip).not.toMatch(/cinematic|stunning|ultra realistic|8K|epic/i);
      }
    }
  });
});
