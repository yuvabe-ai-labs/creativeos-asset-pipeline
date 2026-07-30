import { describe, it, expect } from "vitest";
import {
  CAMERA_TILES,
  CAMERA_AUTO,
  cameraImage,
  cameraLabel,
  cameraTooltip,
  cameraCaption,
} from "./camera-preview";

describe("CAMERA_TILES / CAMERA_AUTO", () => {
  it("exposes the nine camera tiles in VIDEO_CONTROLS order, without auto", () => {
    expect(CAMERA_TILES.map((o) => o.value)).toEqual([
      "static",
      "push-in",
      "pull-back",
      "orbit",
      "tracking",
      "pan",
      "tilt",
      "handheld",
      "crane",
    ]);
  });
  it("splits auto out as its own option", () => {
    expect(CAMERA_AUTO.value).toBe("auto");
    expect(CAMERA_TILES.some((o) => o.value === "auto")).toBe(false);
  });
});

describe("cameraImage", () => {
  it("maps the six imaged moves to their webp under /camera-controls", () => {
    expect(cameraImage("push-in")).toBe("/camera-controls/zoom-in.webp");
    expect(cameraImage("pull-back")).toBe("/camera-controls/zoom-out.webp");
    expect(cameraImage("tracking")).toBe("/camera-controls/tracking-shot.webp");
    expect(cameraImage("pan")).toBe("/camera-controls/pan-left.webp");
    expect(cameraImage("tilt")).toBe("/camera-controls/tilt-up.webp");
    expect(cameraImage("crane")).toBe("/camera-controls/crane.webp");
  });
  it("returns empty string (→ placeholder) for moves with no image", () => {
    expect(cameraImage("static")).toBe("");
    expect(cameraImage("orbit")).toBe("");
    expect(cameraImage("handheld")).toBe("");
    expect(cameraImage("auto")).toBe("");
    expect(cameraImage("nope")).toBe("");
  });
});

describe("cameraLabel", () => {
  it("returns the full option label", () => {
    expect(cameraLabel("push-in")).toBe("Push in");
    expect(cameraLabel("crane")).toBe("Crane");
  });
});

describe("cameraCaption", () => {
  it("capitalizes the prose for a move", () => {
    expect(cameraCaption("push-in")).toBe("A slow, steady push-in toward the subject at a constant focal length");
  });
  it("names the model for auto", () => {
    expect(cameraCaption("auto")).toBe("Camera move chosen by the model");
  });
});

describe("cameraTooltip", () => {
  it("uses the prose for each tile", () => {
    expect(cameraTooltip("orbit")).toBe("a slow, small-angle orbit around the subject, holding constant distance, height, and focal length");
    for (const t of CAMERA_TILES) {
      expect(cameraTooltip(t.value).length).toBeGreaterThan(0);
    }
  });
  it("gives auto a model hint", () => {
    expect(cameraTooltip("auto")).toMatch(/model/i);
  });
});
