import { describe, it, expect } from "vitest";
import { klingV3Params } from "../params/kling";

describe("klingV3Params (Kling 3.0)", () => {
  it("primary params are mode then duration (no camera_move, no aspect_ratio)", () => {
    const primary = klingV3Params.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual(["mode", "duration"]);
  });

  it("duration is a 3–15s slider", () => {
    const duration = klingV3Params.find((p) => p.name === "duration")!;
    expect(duration.component).toBe("slider");
    expect(duration.constraints).toEqual({ type: "slider", min: 3, max: 15, step: 1 });
  });

  it("advanced params are cfg_scale then negative_prompt (no axis sliders)", () => {
    const advanced = klingV3Params.filter((p) => p.group === "advanced");
    expect(advanced.map((p) => p.name)).toEqual(["cfg_scale", "negative_prompt"]);
  });

  it("has no camera or axis params at all", () => {
    const names = klingV3Params.map((p) => p.name);
    for (const banned of ["camera_move", "aspect_ratio", "pan", "tilt", "zoom", "roll", "horizontal_movement", "vertical_movement"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("prefills a visual-defect negative prompt", () => {
    const neg = klingV3Params.find((p) => p.name === "negative_prompt");
    expect(neg?.defaultValue).toContain("blurry");
    expect(neg?.defaultValue).toContain("watermark");
  });
});
