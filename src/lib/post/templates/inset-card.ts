import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "inset-card";
export const name = "Inset card";
export const purposeTags = ["launch", "announcement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.43 };

// Image floats inset on a brand-coloured field; copy sits on the solid, never on the
// photo — contrast is guaranteed and no scrim is needed. The most "designed" of the set.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const copyTop = byBand(band, { portrait: 0.63, square: 0.6, landscape: 0.5 });
  const headSize = byBand(band, { portrait: 0.045, square: 0.042, landscape: 0.055 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.075 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f4e2d4" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: copyTop, w: 1 - m * 2, h: 0.08,
    text: "Introducing our newest", fontSize: headSize, fontWeight: 700, color: "#1e1e1e",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: copyTop + 0.1, w: 1 - m * 2, h: 0.035,
    text: "A short line about why it matters", fontSize: 0.02, fontWeight: 400, color: "#52525b",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.33, y: 0.85, w: 0.33, h: ctaH,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Learn more", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([background, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
