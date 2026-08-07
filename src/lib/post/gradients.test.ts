import { describe, it, expect } from "vitest";
import {
  GRADIENT_PRESETS, GRADIENT_DIRECTIONS, directionToAngle, angleToDirection, makeGradientFill,
} from "./gradients";

describe("GRADIENT_PRESETS", () => {
  it("offers at least six presets with unique ids", () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(6);
    const ids = GRADIENT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every preset in plain language", () => {
    for (const p of GRADIENT_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.label).not.toMatch(/rgba|#[0-9a-f]{3,}/i);
    }
  });

  it("includes a transparent-to-dark scrim, the most useful one over photos", () => {
    const scrim = GRADIENT_PRESETS.find((p) => p.id === "dark-fade");
    expect(scrim).toBeDefined();
    expect(scrim!.from).toBe("rgba(0,0,0,0)");
  });
});

describe("directions", () => {
  it("maps all four directions to distinct angles", () => {
    const angles = GRADIENT_DIRECTIONS.map((d) => d.angle);
    expect(new Set(angles).size).toBe(4);
  });

  it("round-trips direction -> angle -> direction", () => {
    for (const d of GRADIENT_DIRECTIONS) {
      expect(angleToDirection(directionToAngle(d.key))).toBe(d.key);
    }
  });

  it("falls back to 'down' for an angle it does not recognise", () => {
    expect(angleToDirection(37)).toBe("down");
  });
});

describe("makeGradientFill", () => {
  it("builds a gradient Fill from a preset id and direction", () => {
    const fill = makeGradientFill("dark-fade", "up");
    expect(fill).toEqual({
      kind: "gradient",
      from: "rgba(0,0,0,0)",
      to: "rgba(0,0,0,0.72)",
      angle: directionToAngle("up"),
    });
  });

  it("falls back to the first preset for an unknown id", () => {
    const fill = makeGradientFill("nope", "down");
    expect(fill.kind).toBe("gradient");
    if (fill.kind === "gradient") expect(fill.from).toBe(GRADIENT_PRESETS[0].from);
  });
});
