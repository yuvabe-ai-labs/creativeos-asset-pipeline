import { describe, it, expect } from "vitest";
import { klingLegacyParams, klingV3Params } from "../params/kling";

describe("klingLegacyParams", () => {
  it("has mode, duration, aspect_ratio, camera_move as primary", () => {
    const primary = klingLegacyParams.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual(["mode", "duration", "aspect_ratio", "camera_move"]);
  });

  it("camera_move defaults to static with the mappable moves + custom", () => {
    const move = klingLegacyParams.find((p) => p.name === "camera_move")!;
    expect(move.defaultValue).toBe("static");
    expect(move.constraints).toEqual({
      type: "select",
      options: ["static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit", "custom"],
    });
  });

  it("has advanced params: cfg_scale, negative_prompt, pan, tilt, zoom, roll, horizontal_movement, vertical_movement", () => {
    const advanced = klingLegacyParams.filter((p) => p.group === "advanced");
    expect(advanced.map((p) => p.name)).toEqual([
      "cfg_scale", "negative_prompt", "pan", "tilt", "zoom", "roll",
      "horizontal_movement", "vertical_movement",
    ]);
  });

  it("duration options are 5 and 10", () => {
    const duration = klingLegacyParams.find((p) => p.name === "duration")!;
    expect(duration.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });

  it("all params are visible", () => {
    expect(klingLegacyParams.every((p) => p.visible)).toBe(true);
  });

  it("prefills a visual-defect negative prompt", () => {
    const neg = klingLegacyParams.find((p) => p.name === "negative_prompt");
    expect(neg?.defaultValue).toContain("blurry");
    expect(neg?.defaultValue).toContain("watermark");
  });
});

describe("klingV3Params", () => {
  it("v3 duration is a 3–15s slider", () => {
    const duration = klingV3Params.find((p) => p.name === "duration")!;
    expect(duration.component).toBe("slider");
    expect(duration.constraints).toEqual({ type: "slider", min: 3, max: 15, step: 1 });
  });

  it("shares all other params with legacy", () => {
    const legacyNonDuration = klingLegacyParams.filter((p) => p.name !== "duration");
    const v3NonDuration = klingV3Params.filter((p) => p.name !== "duration");
    expect(v3NonDuration).toEqual(legacyNonDuration);
  });
});
