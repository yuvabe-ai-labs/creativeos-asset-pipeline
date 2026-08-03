import type { PostLayer } from "../types";
import { createShapeLayer, createTextLayer } from "../layers";
import type { CopyZone } from "../copy-zone-hint";

export const id = "split-half";
export const name = "Split half";
export const purposeTags = ["discount", "sale"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.5 };

// Hard 50/50 between image and a brand colour block. The loudest option — built for a
// discount number or a big price.
export function seedLayers(): PostLayer[] {
  return [
    createShapeLayer({
      name: "Colour block", x: 0, y: 0.5, w: 1, h: 0.5,
      fill: { kind: "solid", color: "#c8a000" }, radius: 0, locked: true,
    }),
    createTextLayer({
      name: "Headline", x: 0.08, y: 0.57, w: 0.44, h: 0.11,
      text: "Headline", fontSize: 0.055, fontWeight: 700, color: "#1e1e1e",
    }),
    createTextLayer({
      name: "Body copy", x: 0.08, y: 0.71, w: 0.66, h: 0.035,
      text: "Body copy goes here", fontSize: 0.02, fontWeight: 400, color: "rgba(30,30,30,0.72)",
    }),
    createShapeLayer({
      name: "CTA pill", x: 0.58, y: 0.85, w: 0.34, h: 0.055,
      fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
    }),
  ];
}
