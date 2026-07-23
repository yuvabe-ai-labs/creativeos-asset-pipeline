import { VIDEO_CONTROLS, type VideoControlOption } from "@/lib/nodes/video-controls";

// The curated camera moves Kling can hit natively via camera_control, in grid order.
// Handheld is excluded (no camera path). Spec §10.
export const KLING_CAMERA_MOVES = [
  "static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit",
] as const;

const CAMERA_OPTIONS: VideoControlOption[] =
  VIDEO_CONTROLS.find((g) => g.key === "camera")?.options ?? [];

export const KLING_CAMERA_TILES: VideoControlOption[] = KLING_CAMERA_MOVES.map(
  (move) => CAMERA_OPTIONS.find((o) => o.value === move),
).filter((o): o is VideoControlOption => Boolean(o));

export type KlingCameraControl = { type: string; config?: Record<string, number> };

const zeroAxes = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 };

// Kling axis naming is inverted from film: Kling `pan` is a vertical-plane rotation (film TILT),
// Kling `tilt` is a horizontal-plane rotation (film PAN). Translations use horizontal/vertical.
// `type: "customize"` matches the proven custom-mode path in providers/kling.ts.
export function klingCameraControl(move: string): KlingCameraControl | undefined {
  switch (move) {
    case "push-in":   return { type: "customize", config: { ...zeroAxes, zoom: 5 } };
    case "pull-back": return { type: "customize", config: { ...zeroAxes, zoom: -5 } };
    case "pan":       return { type: "customize", config: { ...zeroAxes, tilt: 5 } };
    case "tilt":      return { type: "customize", config: { ...zeroAxes, pan: 5 } };
    case "tracking":  return { type: "customize", config: { ...zeroAxes, horizontal: 5 } };
    case "crane":     return { type: "customize", config: { ...zeroAxes, vertical: 5 } };
    case "orbit":     return { type: "left_turn_forward" };
    default:          return undefined; // static / handheld / unknown
  }
}
