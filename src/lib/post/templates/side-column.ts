import type { PostLayer } from "../types";
import { createShapeLayer, createTextLayer } from "../layers";
import type { CopyZone } from "../copy-zone-hint";

export const id = "side-column";
export const name = "Side column";
export const purposeTags = ["offer", "brochure"];
export const copyZone: CopyZone = { side: "left", fraction: 0.46 };

// Vertical split — image one side, copy column the other. The only archetype with room
// for a real paragraph, so it survives long offer text.
export function seedLayers(): PostLayer[] {
  return [
    createShapeLayer({
      name: "Background", x: 0, y: 0, w: 1, h: 1,
      fill: { kind: "solid", color: "#1b1b22" }, radius: 0, locked: true,
    }),
    createTextLayer({
      name: "Headline", x: 0.08, y: 0.24, w: 0.32, h: 0.07,
      text: "Headline", fontSize: 0.038, fontWeight: 700, color: "#ffffff",
    }),
    createTextLayer({
      name: "Body copy", x: 0.08, y: 0.46, w: 0.36, h: 0.2,
      text: "Body copy goes here", fontSize: 0.018, fontWeight: 400, lineHeight: 1.5,
      color: "rgba(255,255,255,0.72)",
    }),
    createShapeLayer({
      name: "CTA pill", x: 0.08, y: 0.86, w: 0.32, h: 0.05,
      fill: { kind: "solid", color: "#ffffff" }, radius: 999,
    }),
  ];
}
