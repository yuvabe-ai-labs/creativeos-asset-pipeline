import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "before-after";
export const name = "Before / after";
export const purposeTags = ["results", "service"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.24 };

// Two labelled panels with a divider. Portrait stacks them, landscape sits them side by
// side — the comparison only reads if each half keeps a sensible shape.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const stacked = band !== "landscape";
  const m = byBand(band, { portrait: 0.06, square: 0.06, landscape: 0.05 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#101014" }, radius: 0, locked: true,
  });
  const beforePanel = createShapeLayer({
    name: "Before panel",
    x: 0, y: 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fill: { kind: "solid", color: "rgba(255,255,255,0.06)" }, radius: 0,
  });
  const afterPanel = createShapeLayer({
    name: "After panel",
    x: stacked ? 0 : 0.5,
    y: stacked ? 0.4 : 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fill: { kind: "solid", color: "rgba(255,255,255,0.12)" }, radius: 0,
  });
  const beforeLabel = createTextLayer({
    name: "Before label", x: m, y: stacked ? 0.03 : 0.04, w: 0.3, h: 0.04,
    text: "BEFORE", fontSize: 0.02, fontWeight: 700, letterSpacing: 2,
    color: "rgba(255,255,255,0.7)",
  });
  const afterLabel = createTextLayer({
    name: "After label",
    x: stacked ? m : 0.5 + m, y: stacked ? 0.43 : 0.04, w: 0.3, h: 0.04,
    text: "AFTER", fontSize: 0.02, fontWeight: 700, letterSpacing: 2, color: "#ffffff",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.82, w: 1 - m * 2, h: 0.06,
    text: "Six weeks, real results", fontSize: 0.036, fontWeight: 700, color: "#ffffff",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.9, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Book a slot", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [background, beforePanel, afterPanel, beforeLabel, afterLabel, headline, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
