import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "lower-third";
export const name = "Lower third";
export const purposeTags = ["offer", "promotion"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.36 };

// Full-bleed image, copy stacked over a bottom scrim. The safest template: the scrim
// rescues almost any plate. A tall story needs a deeper scrim and a wider landscape post
// a shallower one, or the copy either floats or swallows the picture.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const scrimTop = byBand(band, { portrait: 0.58, square: 0.52, landscape: 0.42 });
  const eyebrowSize = byBand(band, { portrait: 0.016, square: 0.015, landscape: 0.018 });
  const headSize = byBand(band, { portrait: 0.062, square: 0.058, landscape: 0.075 });
  const bodySize = byBand(band, { portrait: 0.02, square: 0.019, landscape: 0.024 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.075 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: scrimTop, w: 1, h: 1 - scrimTop,
    fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.78)", angle: 0 },
    radius: 0,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: scrimTop + 0.04, w: 1 - m * 2, h: 0.03,
    text: "LIMITED-TIME OFFER", fontSize: eyebrowSize, fontWeight: 700,
    letterSpacing: 2, color: "#ffca2d",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: scrimTop + 0.085, w: 1 - m * 2, h: 0.09,
    text: "Your headline here", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: scrimTop + 0.195, w: 1 - m * 2, h: 0.04,
    text: "One line of supporting detail", fontSize: bodySize, fontWeight: 400,
    color: "rgba(255,255,255,0.78)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 1 - m - ctaH, w: 0.34, h: ctaH,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop now", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [scrim, eyebrow, headline, body, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// Full-bleed photo behind the scrim — index 0 puts it at the very back once spliced in.
export function imageSlot(_format: PostFormat): ImageSlot {
  return { x: 0, y: 0, w: 1, h: 1, fit: "cover", index: 0 };
}
