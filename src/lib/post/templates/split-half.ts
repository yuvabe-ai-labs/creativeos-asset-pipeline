import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "split-half";
export const name = "Split half";
export const purposeTags = ["discount", "sale"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.5 };

// A hard split between the photo and a near-black block carrying one big number. The
// loudest option — built for a discount figure or a big price — so the accent yellow is
// spent entirely on the number itself rather than the block behind it.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  // Where the colour block starts. A landscape post splits later so the photo keeps width.
  const splitY = byBand(band, { portrait: 0.55, square: 0.5, landscape: 0.44 });
  const eyebrowSize = byBand(band, { portrait: 0.017, square: 0.016, landscape: 0.02 });
  const headSize = byBand(band, { portrait: 0.11, square: 0.1, landscape: 0.12 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.07 });

  const divider = createShapeLayer({
    name: "Divider", x: 0, y: splitY - 0.003, w: 1, h: 0.006,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 0, locked: true,
  });
  const colourBlock = createShapeLayer({
    name: "Colour block", x: 0, y: splitY, w: 1, h: 1 - splitY,
    fill: { kind: "solid", color: "#121014" }, radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: splitY + 0.05, w: 1 - m * 2, h: 0.03,
    text: "LIMITED TIME", fontSize: eyebrowSize, fontWeight: 700,
    letterSpacing: 2, color: "rgba(255,255,255,0.65)",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: splitY + 0.09, w: 0.6, h: 0.15,
    text: "30% off", fontSize: headSize, fontWeight: 700, color: "#ffca2d",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: splitY + 0.25, w: 1 - m * 2, h: 0.035,
    text: "This week only", fontSize: 0.02, fontWeight: 400, color: "rgba(255,255,255,0.72)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.32, y: 1 - m - ctaH, w: 0.32, h: ctaH,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Claim it", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [divider, colourBlock, eyebrow, headline, body, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// The photo owns the top half above the split; index 0 keeps it behind the divider and
// colour block so the hard edge between them reads clean.
export function imageSlot(format: PostFormat): ImageSlot {
  const band = aspectBand(format);
  const splitY = byBand(band, { portrait: 0.55, square: 0.5, landscape: 0.44 });
  return { x: 0, y: 0, w: 1, h: splitY, fit: "cover", index: 0 };
}
