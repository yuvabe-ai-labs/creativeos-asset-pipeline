import type { Fill } from "./types";

export type GradientDirection = "down" | "up" | "right" | "left";

/**
 * `angle` is what ShapeLayer's gradient Fill stores, and what layer-konva-props turns into
 * Konva's start/end points. Degrees, clockwise, 0 = top-to-bottom.
 */
export const GRADIENT_DIRECTIONS: { key: GradientDirection; label: string; angle: number }[] = [
  { key: "down", label: "Downward", angle: 0 },
  { key: "right", label: "Rightward", angle: 90 },
  { key: "up", label: "Upward", angle: 180 },
  { key: "left", label: "Leftward", angle: 270 },
];

/**
 * Ready-made gradients a non-technical operator can pick by eye (D125). "dark-fade" comes
 * first because a transparent-to-dark scrim is what rescues copy sitting over a photo, and
 * it is what every stock template reaches for.
 */
export const GRADIENT_PRESETS: { id: string; label: string; from: string; to: string }[] = [
  { id: "dark-fade", label: "Dark fade", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.72)" },
  { id: "light-fade", label: "Light fade", from: "rgba(255,255,255,0)", to: "rgba(255,255,255,0.85)" },
  { id: "brand", label: "Brand purple", from: "#5829c7", to: "#8b5cf6" },
  { id: "sunset", label: "Sunset", from: "#ff7a45", to: "#ffca2d" },
  { id: "ocean", label: "Ocean", from: "#0ea5e9", to: "#1e3a8a" },
  { id: "forest", label: "Forest", from: "#14532d", to: "#4ade80" },
  { id: "blush", label: "Blush", from: "#fbcfe8", to: "#f472b6" },
  { id: "slate", label: "Slate", from: "#1e1e1e", to: "#64748b" },
];

export function directionToAngle(direction: GradientDirection): number {
  return GRADIENT_DIRECTIONS.find((d) => d.key === direction)?.angle ?? 0;
}

/** Any angle we didn't author (e.g. legacy data) reads as the default, "down". */
export function angleToDirection(angle: number): GradientDirection {
  return GRADIENT_DIRECTIONS.find((d) => d.angle === angle)?.key ?? "down";
}

export function makeGradientFill(presetId: string, direction: GradientDirection): Fill {
  const preset = GRADIENT_PRESETS.find((p) => p.id === presetId) ?? GRADIENT_PRESETS[0];
  return {
    kind: "gradient",
    from: preset.from,
    to: preset.to,
    angle: directionToAngle(direction),
  };
}
