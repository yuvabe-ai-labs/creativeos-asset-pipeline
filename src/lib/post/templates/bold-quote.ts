import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "bold-quote";
export const name = "Bold quote";
export const purposeTags = ["quote", "engagement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.6 };

// A full-bleed dim over the photo with one large centred pull-quote. Nothing competes with
// the sentence, which is the whole point — quote cards live or die on legibility.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.1, square: 0.1, landscape: 0.14 });
  const quoteSize = byBand(band, { portrait: 0.06, square: 0.056, landscape: 0.064 });
  const quoteTop = byBand(band, { portrait: 0.32, square: 0.34, landscape: 0.26 });

  const dim = createShapeLayer({
    name: "Dim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "rgba(10,8,14,0.6)" }, radius: 0, locked: true,
  });
  const mark = createTextLayer({
    name: "Quote mark", x: m, y: quoteTop - 0.11, w: 0.2, h: 0.1,
    text: "“", fontSize: 0.11, fontWeight: 700, color: "rgba(255,202,45,0.85)",
  });
  const quote = createTextLayer({
    name: "Quote", x: m, y: quoteTop, w: 1 - m * 2, h: 0.28,
    text: "The line worth stopping the scroll for.",
    fontSize: quoteSize, fontWeight: 700, lineHeight: 1.25, color: "#ffffff", align: "center",
  });
  const rule = createShapeLayer({
    name: "Rule", x: 0.5 - 0.05, y: quoteTop + 0.31, w: 0.1, h: 0.004,
    fill: { kind: "solid", color: "rgba(255,255,255,0.5)" }, radius: 0, locked: true,
  });
  const attribution = createTextLayer({
    name: "Attribution", x: m, y: quoteTop + 0.34, w: 1 - m * 2, h: 0.04,
    text: "— Name, Role", fontSize: 0.019, fontWeight: 400,
    color: "rgba(255,255,255,0.72)", align: "center",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 0.5 - 0.16, y: 1 - m - 0.05, w: 0.32, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Read more", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [dim, mark, quote, rule, attribution, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// Full-bleed photo behind the dim wash — index 0, same as lower-third.
export function imageSlot(_format: PostFormat): ImageSlot {
  return { x: 0, y: 0, w: 1, h: 1, fit: "cover", index: 0 };
}
