import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "product-hero";
export const name = "Product hero";
export const purposeTags = ["ecommerce", "product"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.34 };

// The product photo fills the top field; a white panel underneath carries name, price and
// CTA on flat colour. The e-commerce workhorse: the photo stays untouched and every word
// sits where contrast is guaranteed.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const panelTop = byBand(band, { portrait: 0.7, square: 0.66, landscape: 0.56 });
  const eyebrowSize = byBand(band, { portrait: 0.016, square: 0.015, landscape: 0.018 });
  const nameSize = byBand(band, { portrait: 0.042, square: 0.038, landscape: 0.048 });
  const priceSize = byBand(band, { portrait: 0.034, square: 0.032, landscape: 0.038 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.07 });

  const field = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f6f4f0" }, radius: 0, locked: true,
  });
  const panel = createShapeLayer({
    name: "Copy panel", x: 0, y: panelTop, w: 1, h: 1 - panelTop,
    fill: { kind: "solid", color: "#ffffff" }, radius: 0,
  });
  const panelEdge = createShapeLayer({
    name: "Panel edge", x: 0, y: panelTop, w: 1, h: 0.004,
    fill: { kind: "solid", color: "#5829c7" }, radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: panelTop + 0.04, w: 1 - m * 2, h: 0.03,
    text: "NEW ARRIVAL", fontSize: eyebrowSize, fontWeight: 700,
    letterSpacing: 2, color: "#8a8a90",
  });
  const productName = createTextLayer({
    name: "Product name", x: m, y: panelTop + 0.08, w: 1 - m * 2, h: 0.06,
    text: "Product name", fontSize: nameSize, fontWeight: 700, color: "#1e1e1e",
  });
  const price = createTextLayer({
    name: "Price", x: m, y: panelTop + 0.16, w: 0.4, h: 0.055,
    text: "₹1,299", fontSize: priceSize, fontWeight: 600, color: "#5829c7",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.34, y: panelTop + 0.16, w: 0.34, h: ctaH,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Buy now", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [field, panel, panelEdge, eyebrow, productName, price, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// The product photo fills the top field, edge to edge — index 1 splices it in above the
// neutral fallback backdrop but below the white copy panel and its accent edge.
export function imageSlot(format: PostFormat): ImageSlot {
  const band = aspectBand(format);
  const panelTop = byBand(band, { portrait: 0.7, square: 0.66, landscape: 0.56 });
  return { x: 0, y: 0, w: 1, h: panelTop, fit: "cover", index: 1 };
}
