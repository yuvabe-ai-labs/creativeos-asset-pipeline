import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "testimonial";
export const name = "Testimonial";
export const purposeTags = ["social-proof", "review"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.55 };

// A card floating on a soft field: stars, the quote, then who said it. Social proof reads
// as proof only when the attribution is as legible as the praise.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const cardTop = byBand(band, { portrait: 0.42, square: 0.38, landscape: 0.3 });
  const quoteSize = byBand(band, { portrait: 0.034, square: 0.032, landscape: 0.038 });

  const field = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#eef0f6" }, radius: 0, locked: true,
  });
  const card = createShapeLayer({
    name: "Card", x: m, y: cardTop, w: 1 - m * 2, h: 0.86 - cardTop,
    fill: { kind: "solid", color: "#ffffff" }, radius: 24,
  });
  const stars = createTextLayer({
    name: "Stars", x: m + 0.04, y: cardTop + 0.04, w: 0.4, h: 0.04,
    text: "★★★★★", fontSize: 0.026, fontWeight: 700, color: "#ffca2d",
  });
  const quote = createTextLayer({
    name: "Quote", x: m + 0.04, y: cardTop + 0.11, w: 1 - m * 2 - 0.08, h: 0.2,
    text: "Genuinely changed how our team works. Worth every rupee.",
    fontSize: quoteSize, fontWeight: 600, lineHeight: 1.4, color: "#1e1e1e",
  });
  const who = createTextLayer({
    name: "Attribution", x: m + 0.04, y: 0.76, w: 1 - m * 2 - 0.08, h: 0.04,
    text: "Name — Role, Company", fontSize: 0.019, fontWeight: 400, color: "#6b7280",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m + 0.04, y: 0.88, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Read reviews", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([field, card, stars, quote, who, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
