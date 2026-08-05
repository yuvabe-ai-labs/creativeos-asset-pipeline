import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "side-column";
export const name = "Side column";
export const purposeTags = ["offer", "brochure"];
export const copyZone: CopyZone = { side: "left", fraction: 0.46 };

// Vertical split — image one side, copy column the other. The only archetype with room
// for a real paragraph, so it survives long offer text.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  // The copy column is a fraction of WIDTH, so a wide post can afford a narrower one.
  const colW = byBand(band, { portrait: 0.5, square: 0.36, landscape: 0.32 });
  const headSize = byBand(band, { portrait: 0.042, square: 0.038, landscape: 0.05 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#1b1b22" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.24, w: colW, h: 0.07,
    text: "A reason to look", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: 0.46, w: colW, h: 0.2,
    text: "Room here for the longer explanation an offer usually needs.",
    fontSize: 0.018, fontWeight: 400, lineHeight: 1.5, color: "rgba(255,255,255,0.72)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.86, w: Math.min(colW, 0.32), h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See the offer", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([background, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
