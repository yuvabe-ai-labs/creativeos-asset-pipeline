import { describe, it, expect } from "vitest";
import { KLING_CAMERA_MOVES, KLING_CAMERA_TILES, klingCameraControl } from "../kling-camera";

describe("kling-camera", () => {
  it("lists the mappable moves in order and excludes handheld", () => {
    expect(KLING_CAMERA_MOVES).toEqual([
      "static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit",
    ]);
    expect(KLING_CAMERA_MOVES).not.toContain("handheld");
  });

  it("derives tiles from VIDEO_CONTROLS with labels present", () => {
    expect(KLING_CAMERA_TILES.map((t) => t.value)).toEqual([...KLING_CAMERA_MOVES]);
    expect(KLING_CAMERA_TILES.find((t) => t.value === "push-in")?.label).toBe("Push in");
  });

  it("maps film moves to Kling axes (film pan -> Kling tilt; film tilt -> Kling pan)", () => {
    expect(klingCameraControl("pan")?.config?.tilt).toBe(5);
    expect(klingCameraControl("pan")?.config?.pan).toBe(0);
    expect(klingCameraControl("tilt")?.config?.pan).toBe(5);
    expect(klingCameraControl("push-in")?.config?.zoom).toBe(5);
    expect(klingCameraControl("pull-back")?.config?.zoom).toBe(-5);
    expect(klingCameraControl("tracking")?.config?.horizontal).toBe(5);
    expect(klingCameraControl("crane")?.config?.vertical).toBe(5);
  });

  it("maps orbit to the turn preset and static to no camera_control", () => {
    expect(klingCameraControl("orbit")).toEqual({ type: "left_turn_forward" });
    expect(klingCameraControl("static")).toBeUndefined();
    expect(klingCameraControl("handheld")).toBeUndefined();
  });
});
