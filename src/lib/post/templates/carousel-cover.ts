import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "carousel-cover";
export const name = "Carousel cover";
export const purposeTags = ["carousel", "engagement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.5 };

// Slide-one of a carousel: an oversized title and an explicit swipe affordance. Carousels
// are the highest-engagement feed format, and they only work if slide one earns the swipe.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const titleSize = byBand(band, { portrait: 0.078, square: 0.072, landscape: 0.082 });
  const titleTop = byBand(band, { portrait: 0.36, square: 0.34, landscape: 0.28 });

  // Full canvas so a photo dropped behind it (see imageSlot) always finds a scrim already
  // in place, and the composition still reads as intentional with no photo connected.
  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "gradient", from: "rgba(11,15,25,0.08)", to: "rgba(11,15,25,0.9)", angle: 0 },
    radius: 0, locked: true,
  });
  const rule = createShapeLayer({
    name: "Accent rule", x: m, y: titleTop - 0.1, w: 0.055, h: 0.007,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 999,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: titleTop - 0.07, w: 1 - m * 2, h: 0.04,
    text: "GUIDE", fontSize: 0.019, fontWeight: 700, letterSpacing: 3,
    color: "rgba(255,255,255,0.7)",
  });
  const title = createTextLayer({
    name: "Title", x: m, y: titleTop, w: 1 - m * 2, h: 0.28,
    text: "5 things nobody tells you", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.12, color: "#ffffff",
  });
  const swipePill = createShapeLayer({
    name: "Swipe pill", x: m, y: 0.87, w: 0.34, h: 0.055,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const swipeText = createTextLayer({
    name: "Swipe label", x: swipePill.x, y: swipePill.y, w: swipePill.w, h: swipePill.h,
    text: "Swipe →", fontSize: 0.019, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [scrim, rule, eyebrow, title, swipePill, swipeText],
    [swipePill.id, swipeText.id],
  );
}

// Full-bleed behind the scrim at every band — the whole point of a cover slide is the
// photo filling the frame, so there's nothing to vary by aspect.
export function imageSlot(_format: PostFormat): ImageSlot {
  return { x: 0, y: 0, w: 1, h: 1, fit: "cover", index: 0 };
}
