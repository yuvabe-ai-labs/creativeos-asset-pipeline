import { describe, it, expect } from "vitest";
import {
  DEFAULT_VIDEO_CONTROLS,
  renderVideoControls,
  VIDEO_CONTROLS,
} from "../video-controls";

describe("video-controls", () => {
  it("defaults every control to 'auto'", () => {
    expect(DEFAULT_VIDEO_CONTROLS).toEqual({ camera: "auto", speed: "auto" });
  });

  it("renders nothing when all controls are auto", () => {
    expect(renderVideoControls({ camera: "auto", speed: "auto" })).toBe("");
  });

  it("renders the camera move as a standalone clause", () => {
    const out = renderVideoControls({ camera: "push-in", speed: "auto" });
    expect(out).toContain("Camera:");
    expect(out).toContain("a slow push-in toward the subject");
    expect(out).not.toContain("Speed:"); // speed is auto → omitted
  });

  it("renders multiple non-auto controls", () => {
    const out = renderVideoControls({ camera: "orbit", speed: "dynamic" });
    expect(out).toContain("a gentle orbit around the subject");
    expect(out).toContain("Speed:");
  });

  it("every catalog option has a value, label, and (for non-auto) prose", () => {
    for (const group of VIDEO_CONTROLS) {
      for (const o of group.options) {
        expect(o.value).toBeTruthy();
        expect(o.label).toBeTruthy();
        if (o.value !== "auto") expect(o.prose).toBeTruthy();
      }
    }
  });

  it("always includes the camera prose (text-camera for all providers)", () => {
    const out = renderVideoControls({ camera: "push-in", speed: "dynamic" });
    expect(out).toContain("Camera:");
    expect(out).toContain("Speed:");
  });
});
