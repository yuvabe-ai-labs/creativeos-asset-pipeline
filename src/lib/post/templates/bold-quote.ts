import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "bold-quote";
export const name = "Bold quote";
export const purposeTags = ["quote", "engagement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.6 };

// A full-bleed dim over the photo with one large centred pull-quote. Nothing competes with
// the sentence, which is the whole point — quote cards live or die on legibility.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.1, square: 0.1, landscape: 0.12 });
  const quoteSize = byBand(band, { portrait: 0.058, square: 0.055, landscape: 0.062 });
  const quoteTop = byBand(band, { portrait: 0.3, square: 0.32, landscape: 0.24 });

  const dim = createShapeLayer({
    name: "Dim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "rgba(0,0,0,0.55)" }, radius: 0, locked: true,
  });
  const mark = createTextLayer({
    name: "Quote mark", x: m, y: quoteTop - 0.1, w: 0.2, h: 0.1,
    text: "“", fontSize: 0.1, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  });
  const quote = createTextLayer({
    name: "Quote", x: m, y: quoteTop, w: 1 - m * 2, h: 0.3,
    text: "The line worth stopping the scroll for.",
    fontSize: quoteSize, fontWeight: 700, lineHeight: 1.25, color: "#ffffff", align: "center",
  });
  const attribution = createTextLayer({
    name: "Attribution", x: m, y: quoteTop + 0.33, w: 1 - m * 2, h: 0.04,
    text: "— Name, Role", fontSize: 0.02, fontWeight: 400,
    color: "rgba(255,255,255,0.75)", align: "center",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 0.33, y: 0.87, w: 0.34, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Read more", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([dim, mark, quote, attribution, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
