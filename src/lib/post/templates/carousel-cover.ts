import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "carousel-cover";
export const name = "Carousel cover";
export const purposeTags = ["carousel", "engagement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.5 };

// Slide-one of a carousel: an oversized title and an explicit swipe affordance. Carousels
// are the highest-engagement feed format, and they only work if slide one earns the swipe.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const titleSize = byBand(band, { portrait: 0.075, square: 0.07, landscape: 0.08 });
  const titleTop = byBand(band, { portrait: 0.34, square: 0.32, landscape: 0.26 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "gradient", from: "rgba(0,0,0,0.15)", to: "rgba(0,0,0,0.8)", angle: 0 },
    radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: titleTop - 0.07, w: 1 - m * 2, h: 0.04,
    text: "GUIDE", fontSize: 0.02, fontWeight: 700, letterSpacing: 3,
    color: "rgba(255,255,255,0.75)",
  });
  const title = createTextLayer({
    name: "Title", x: m, y: titleTop, w: 1 - m * 2, h: 0.28,
    text: "5 things nobody tells you", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.15, color: "#ffffff",
  });
  const swipePill = createShapeLayer({
    name: "Swipe pill", x: m, y: 0.87, w: 0.38, h: 0.055,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const swipeText = createTextLayer({
    name: "Swipe label", x: swipePill.x, y: swipePill.y, w: swipePill.w, h: swipePill.h,
    text: "Swipe →", fontSize: 0.019, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([scrim, eyebrow, title, swipePill, swipeText], [swipePill.id, swipeText.id]);
}
