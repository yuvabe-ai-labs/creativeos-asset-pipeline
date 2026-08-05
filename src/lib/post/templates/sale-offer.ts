import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "sale-offer";
export const name = "Sale offer";
export const purposeTags = ["discount", "sale", "urgency"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.42 };

// A ringed discount disc over the product, urgency underneath, code last. Loud on purpose —
// the number is the message and everything else is support.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const discSize = byBand(band, { portrait: 0.3, square: 0.32, landscape: 0.4 });
  const discY = byBand(band, { portrait: 0.09, square: 0.07, landscape: 0.05 });
  const percentSize = byBand(band, { portrait: 0.05, square: 0.052, landscape: 0.062 });
  const offSize = byBand(band, { portrait: 0.017, square: 0.018, landscape: 0.02 });
  const scrimTop = byBand(band, { portrait: 0.6, square: 0.56, landscape: 0.48 });
  const headSize = byBand(band, { portrait: 0.05, square: 0.048, landscape: 0.056 });

  const disc = createShapeLayer({
    name: "Discount disc", x: 1 - m - discSize, y: discY, w: discSize, h: discSize,
    fill: { kind: "solid", color: "#c81e4a" }, radius: 999,
    stroke: { color: "#ffca2d", width: 3 },
  });
  const discPercent = createTextLayer({
    name: "Discount percent", x: disc.x, y: disc.y + discSize * 0.28, w: discSize, h: discSize * 0.32,
    text: "30%", fontSize: percentSize, fontWeight: 700, color: "#ffffff", align: "center",
  });
  const discOff = createTextLayer({
    name: "Discount label", x: disc.x, y: disc.y + discSize * 0.58, w: discSize, h: discSize * 0.18,
    text: "OFF", fontSize: offSize, fontWeight: 700, letterSpacing: 3,
    color: "rgba(255,255,255,0.85)", align: "center",
  });
  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: scrimTop, w: 1, h: 1 - scrimTop,
    fill: { kind: "gradient", from: "rgba(11,15,25,0)", to: "rgba(11,15,25,0.88)", angle: 0 },
    radius: 0,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: scrimTop + 0.1, w: 1 - m * 2, h: 0.08,
    text: "Mid-season sale", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const urgency = createTextLayer({
    name: "Urgency", x: m, y: scrimTop + 0.19, w: 1 - m * 2, h: 0.04,
    text: "Ends Sunday · Use code SAVE30", fontSize: 0.021, fontWeight: 500,
    color: "rgba(255,255,255,0.78)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.36, h: 0.055,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop the sale", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [disc, discPercent, discOff, scrim, headline, urgency, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// Full-bleed behind the disc and scrim at every band — the product photo IS the sale, the
// disc just interrupts a corner of it.
export function imageSlot(_format: PostFormat): ImageSlot {
  return { x: 0, y: 0, w: 1, h: 1, fit: "cover", index: 0 };
}
