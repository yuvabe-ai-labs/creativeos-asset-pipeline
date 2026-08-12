import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "inset-card";
export const name = "Inset card";
export const purposeTags = ["launch", "announcement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.4 };

// Image floats as an inset, rounded-corner plate on a soft neutral field; copy sits on the
// solid, never on the photo — contrast is guaranteed and no scrim is needed. The most
// "designed" of the set.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const plateBottom = byBand(band, { portrait: 0.58, square: 0.54, landscape: 0.46 });
  const eyebrowSize = byBand(band, { portrait: 0.017, square: 0.016, landscape: 0.02 });
  const headSize = byBand(band, { portrait: 0.05, square: 0.046, landscape: 0.058 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.075 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f7f3ee" }, radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: plateBottom + 0.05, w: 1 - m * 2, h: 0.03,
    text: "NEW ARRIVAL", fontSize: eyebrowSize, fontWeight: 700,
    letterSpacing: 2, color: "#5829c7",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: plateBottom + 0.09, w: 1 - m * 2, h: 0.08,
    text: "Introducing our newest", fontSize: headSize, fontWeight: 700, color: "#1e1e1e",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: plateBottom + 0.185, w: 1 - m * 2, h: 0.035,
    text: "A short line about why it matters", fontSize: 0.02, fontWeight: 400, color: "#6b6b70",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 1 - m - ctaH, w: 0.33, h: ctaH,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Learn more", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [background, eyebrow, headline, body, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// An inset, rounded plate above the neutral field but below the copy — index 1 splices it
// in right after the background so it reads as a photo laid ON the card, not behind it.
export function imageSlot(format: PostFormat): ImageSlot {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const plateBottom = byBand(band, { portrait: 0.58, square: 0.54, landscape: 0.46 });
  return { x: m, y: m, w: 1 - m * 2, h: plateBottom - m, fit: "cover", index: 1, radius: 20 };
}
