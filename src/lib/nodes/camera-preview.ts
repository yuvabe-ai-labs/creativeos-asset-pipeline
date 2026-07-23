// Presentational helpers for the visual Camera selector — sibling of composition-preview.ts, but
// for the Video Prompt node's motion controls. Pure and React-free so CameraSelect stays thin markup
// and these can be unit-tested in the node env. No prompt/data/API impact: option values come from
// VIDEO_CONTROLS (single source of truth). Each camera move is a distinct clip poster under
// /public/camera-controls; moves with no curated image fall back to a placeholder tile.

import { VIDEO_CONTROLS, type VideoControlOption } from "./video-controls";

const CAMERA_OPTIONS: VideoControlOption[] =
  VIDEO_CONTROLS.find((g) => g.key === "camera")?.options ?? [];

// The eight camera tiles, in VIDEO_CONTROLS order — Auto is pulled out into a header chip.
export const CAMERA_TILES: VideoControlOption[] = CAMERA_OPTIONS.filter((o) => o.value !== "auto");

// The Auto option (drives the header chip's label).
export const CAMERA_AUTO: VideoControlOption =
  CAMERA_OPTIONS.find((o) => o.value === "auto") ?? { value: "auto", label: "Auto", prose: "" };

// Option value -> clip poster. Only the six moves with curated art; the rest render a placeholder.
export const CAMERA_IMAGES: Record<string, string> = {
  "push-in": "/camera-controls/zoom-in.webp",
  "pull-back": "/camera-controls/zoom-out.webp",
  orbit: "/camera-controls/tracking-shot.webp",
  pan: "/camera-controls/pan-left.webp",
  tilt: "/camera-controls/tilt-up.webp",
  crane: "/camera-controls/crane.webp",
};

function cameraProse(value: string): string {
  return CAMERA_OPTIONS.find((o) => o.value === value)?.prose ?? "";
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// Poster for a camera tile. "" for auto/unmapped moves (→ placeholder tile).
export function cameraImage(value: string): string {
  return CAMERA_IMAGES[value] ?? "";
}

// Full option label ("Push in") from the video-controls source.
export function cameraLabel(value: string): string {
  return CAMERA_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Per-tile tooltip: the option's prose. Auto → a model hint.
export function cameraTooltip(value: string): string {
  if (value === "auto") return "Let the model choose the camera move.";
  return cameraProse(value);
}

// Caption under the strip: the selected move's prose, capitalized. Auto → names the model.
export function cameraCaption(value: string): string {
  if (value === "auto") return "Camera move chosen by the model";
  return capitalize(cameraProse(value));
}
