import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "split-half";
export const name = "Split half";
export const purposeTags = ["discount", "sale"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.5 };

// Hard 50/50 between image and a brand colour block. The loudest option — built for a
// discount number or a big price.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  // Where the colour block starts. A landscape post splits later so the photo keeps width.
  const splitY = byBand(band, { portrait: 0.55, square: 0.5, landscape: 0.45 });
  const headSize = byBand(band, { portrait: 0.06, square: 0.055, landscape: 0.07 });

  const colourBlock = createShapeLayer({
    name: "Colour block", x: 0, y: splitY, w: 1, h: 1 - splitY,
    fill: { kind: "solid", color: "#c8a000" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: splitY + 0.07, w: 0.5, h: 0.11,
    text: "30% off", fontSize: headSize, fontWeight: 700, color: "#1e1e1e",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: splitY + 0.21, w: 1 - m * 2, h: 0.035,
    text: "This week only", fontSize: 0.02, fontWeight: 400, color: "rgba(30,30,30,0.72)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.34, y: 0.85, w: 0.34, h: 0.055,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Claim it", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([colourBlock, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
