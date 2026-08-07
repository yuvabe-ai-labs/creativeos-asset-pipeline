import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "side-column";
export const name = "Side column";
export const purposeTags = ["offer", "brochure"];
export const copyZone: CopyZone = { side: "left", fraction: 0.46 };

// Vertical split — a dark copy panel on one side, the image filling the rest. The only
// archetype with room for a real paragraph, so it survives long offer text. A landscape
// post can spare more width for the photo than a tall one can.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.08, landscape: 0.06 });
  const panelW = byBand(band, { portrait: 0.56, square: 0.44, landscape: 0.37 });
  const eyebrowSize = byBand(band, { portrait: 0.017, square: 0.016, landscape: 0.019 });
  const headSize = byBand(band, { portrait: 0.046, square: 0.04, landscape: 0.052 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.07 });

  const panel = createShapeLayer({
    name: "Copy panel", x: 0, y: 0, w: panelW, h: 1,
    fill: { kind: "solid", color: "#141018" }, radius: 0, locked: true,
  });
  const accentRule = createShapeLayer({
    name: "Accent rule", x: panelW - 0.006, y: 0, w: 0.006, h: 1,
    fill: { kind: "solid", color: "#5829c7" }, radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: 0.16, w: panelW - m * 2, h: 0.03,
    text: "THIS WEEK", fontSize: eyebrowSize, fontWeight: 700,
    letterSpacing: 2, color: "#ffca2d",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.21, w: panelW - m * 2, h: 0.16,
    text: "A reason to look", fontSize: headSize, fontWeight: 700, lineHeight: 1.15, color: "#ffffff",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: 0.44, w: panelW - m * 2, h: 0.22,
    text: "Room here for the longer explanation an offer usually needs.",
    fontSize: 0.018, fontWeight: 400, lineHeight: 1.55, color: "rgba(255,255,255,0.7)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 1 - 0.1 - ctaH, w: Math.min(panelW - m * 2, 0.3), h: ctaH,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See the offer", fontSize: 0.017, fontWeight: 700, color: "#141018", align: "center",
  });
  return groupLayers(
    [panel, accentRule, eyebrow, headline, body, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// The image owns everything the copy panel doesn't — full height, opposite side. Index 0
// so it sits behind the panel/rule (harmless, since the two never overlap) with no gap
// between the photo edge and the panel edge.
export function imageSlot(format: PostFormat): ImageSlot {
  const band = aspectBand(format);
  const panelW = byBand(band, { portrait: 0.56, square: 0.44, landscape: 0.37 });
  return { x: panelW, y: 0, w: 1 - panelW, h: 1, fit: "cover", index: 0 };
}
