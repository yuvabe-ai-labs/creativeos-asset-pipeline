import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "product-hero";
export const name = "Product hero";
export const purposeTags = ["ecommerce", "product"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.34 };

// Soft field behind the product, name and price stacked beneath. The e-commerce workhorse:
// the photo stays untouched and every word sits on flat colour.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const panelTop = byBand(band, { portrait: 0.7, square: 0.66, landscape: 0.58 });
  const nameSize = byBand(band, { portrait: 0.04, square: 0.038, landscape: 0.048 });

  const field = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f6f5f2" }, radius: 0, locked: true,
  });
  const panel = createShapeLayer({
    name: "Copy panel", x: 0, y: panelTop, w: 1, h: 1 - panelTop,
    fill: { kind: "solid", color: "#ffffff" }, radius: 0,
  });
  const productName = createTextLayer({
    name: "Product name", x: m, y: panelTop + 0.05, w: 1 - m * 2, h: 0.06,
    text: "Product name", fontSize: nameSize, fontWeight: 700, color: "#1e1e1e",
  });
  const price = createTextLayer({
    name: "Price", x: m, y: panelTop + 0.13, w: 0.4, h: 0.05,
    text: "₹1,299", fontSize: 0.032, fontWeight: 600, color: "#5829c7",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.34, y: panelTop + 0.13, w: 0.34, h: 0.055,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Buy now", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([field, panel, productName, price, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
