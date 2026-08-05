import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "sale-offer";
export const name = "Sale offer";
export const purposeTags = ["discount", "sale", "urgency"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.42 };

// A discount disc over the product, urgency underneath, code last. Loud on purpose — the
// number is the message and everything else is support.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const discSize = byBand(band, { portrait: 0.3, square: 0.32, landscape: 0.42 });
  const discY = byBand(band, { portrait: 0.1, square: 0.08, landscape: 0.06 });

  const disc = createShapeLayer({
    name: "Discount disc", x: 1 - m - discSize, y: discY, w: discSize, h: discSize,
    fill: { kind: "solid", color: "#e11d48" }, radius: 999,
  });
  const discText = createTextLayer({
    name: "Discount", x: disc.x, y: disc.y + discSize * 0.34, w: discSize, h: discSize * 0.3,
    text: "30% OFF", fontSize: 0.036, fontWeight: 700, color: "#ffffff", align: "center",
  });
  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: 0.58, w: 1, h: 0.42,
    fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.85)", angle: 0 },
    radius: 0,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.7, w: 1 - m * 2, h: 0.08,
    text: "Mid-season sale", fontSize: 0.05, fontWeight: 700, color: "#ffffff",
  });
  const urgency = createTextLayer({
    name: "Urgency", x: m, y: 0.79, w: 1 - m * 2, h: 0.04,
    text: "Ends Sunday · Use code SAVE30", fontSize: 0.021, fontWeight: 500,
    color: "rgba(255,255,255,0.85)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.87, w: 0.36, h: 0.055,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop the sale", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [disc, discText, scrim, headline, urgency, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
