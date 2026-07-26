import { describe, it, expect } from "vitest";
import { klingV3Params } from "../params/kling";

describe("klingV3Params (Kling 3.0)", () => {
  it("is one flat primary group ordered mode, duration, cfg_scale, negative_prompt", () => {
    expect(klingV3Params.map((p) => p.name)).toEqual([
      "mode",
      "duration",
      "cfg_scale",
      "negative_prompt",
    ]);
    expect(klingV3Params.every((p) => p.group === "primary")).toBe(true);
  });

  it("duration is a 4/6/8s select", () => {
    const duration = klingV3Params.find((p) => p.name === "duration")!;
    expect(duration.component).toBe("select");
    expect(duration.constraints).toEqual({ type: "select", options: ["4", "6", "8"] });
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
