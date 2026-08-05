import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

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
  const headSize = byBand(band, { portrait: 0.05, square: 0.045, landscape: 0.06 });
  const bodySize = byBand(band, { portrait: 0.021, square: 0.02, landscape: 0.026 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.075 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: scrimTop, w: 1, h: 1 - scrimTop,
    fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.72)", angle: 0 },
    radius: 0,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.72, w: 1 - m * 2, h: 0.08,
    text: "Your headline here", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: 0.805, w: 1 - m * 2, h: 0.035,
    text: "One line of supporting detail", fontSize: bodySize, fontWeight: 400,
    color: "rgba(255,255,255,0.85)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.875, w: 0.34, h: ctaH,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop now", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([scrim, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
