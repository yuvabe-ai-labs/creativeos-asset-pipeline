import type { PostLayer } from "../types";
import { createShapeLayer, createTextLayer } from "../layers";
import type { CopyZone } from "../copy-zone-hint";

export const id = "lower-third";
export const name = "Lower third";
export const purposeTags = ["offer", "promotion"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.36 };

// Full-bleed image, copy stacked in the bottom 35% over a scrim (a gradient-filled shape
// — post-node-design.md §4: folding the scrim into `shape` removes a concept without
// removing the capability). The safest template: the scrim rescues almost any plate.
export function seedLayers(): PostLayer[] {
  return [
    createShapeLayer({
      name: "Scrim",
      x: 0, y: 0.52, w: 1, h: 0.48,
      fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.72)", angle: 0 },
      radius: 0,
    }),
    createTextLayer({
      name: "Headline",
      x: 0.08, y: 0.74, w: 0.6, h: 0.08,
      text: "Headline", fontSize: 0.045, fontWeight: 700, color: "#ffffff",
    }),
    createTextLayer({
      name: "Body copy",
      x: 0.08, y: 0.81, w: 0.74, h: 0.035,
      text: "Body copy goes here", fontSize: 0.02, fontWeight: 400, color: "rgba(255,255,255,0.85)",
    }),
    createShapeLayer({
      name: "CTA pill",
      x: 0.08, y: 0.88, w: 0.34, h: 0.055,
      fill: { kind: "solid", color: "#ffffff" }, radius: 999,
    }),
  ];
}
