import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "before-after";
export const name = "Before / after";
export const purposeTags = ["results", "service"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.24 };

// Two panels with a thin accent divider. Portrait stacks them, landscape sits them side by
// side — the comparison only reads if each half keeps a sensible shape. The "before" photo
// only gets a light scrim (just enough for the label to survive); "after" stays a deliberate
// dark plate so the eye lands on the result copy, not a second, absent photo.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const stacked = band !== "landscape";
  const m = byBand(band, { portrait: 0.06, square: 0.06, landscape: 0.05 });
  const headSize = byBand(band, { portrait: 0.04, square: 0.038, landscape: 0.044 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.07 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#111014" }, radius: 0, locked: true,
  });
  // Sits directly over the photo slot — just enough dark wash for the BEFORE label to read
  // without flattening the picture the way a solid panel would.
  const beforeScrim = createShapeLayer({
    name: "Before scrim",
    x: 0, y: 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fill: { kind: "gradient", from: "rgba(0,0,0,0.05)", to: "rgba(0,0,0,0.55)", angle: 0 },
    radius: 0,
  });
  const afterPanel = createShapeLayer({
    name: "After panel",
    x: stacked ? 0 : 0.5,
    y: stacked ? 0.4 : 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fill: { kind: "solid", color: "#241a3d" }, radius: 0,
  });
  const divider = createShapeLayer({
    name: "Divider",
    x: stacked ? 0 : 0.5 - 0.003,
    y: stacked ? 0.39 : 0,
    w: stacked ? 1 : 0.006,
    h: stacked ? 0.006 : 0.78,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 0, locked: true,
  });
  const beforeLabel = createTextLayer({
    name: "Before label", x: m, y: stacked ? 0.04 : 0.05, w: 0.3, h: 0.04,
    text: "BEFORE", fontSize: 0.019, fontWeight: 700, letterSpacing: 2,
    color: "rgba(255,255,255,0.75)",
  });
  const afterLabel = createTextLayer({
    name: "After label",
    x: stacked ? m : 0.5 + m, y: stacked ? 0.44 : 0.05, w: 0.3, h: 0.04,
    text: "AFTER", fontSize: 0.019, fontWeight: 700, letterSpacing: 2, color: "#ffca2d",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.8, w: 1 - m * 2, h: 0.06,
    text: "Six weeks, real results", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 1 - m - ctaH, w: 0.36, h: ctaH,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Book a slot", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [background, beforeScrim, afterPanel, divider, beforeLabel, afterLabel, headline, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// The connected photo becomes the "before" — index 1 splices it in above the background
// but below the before-scrim/label, exactly filling the same region the scrim sits over.
// Stacked bands (portrait/square) put it up top; landscape puts it on the left.
export function imageSlot(format: PostFormat): ImageSlot {
  const band = aspectBand(format);
  const stacked = band !== "landscape";
  return {
    x: 0, y: 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fit: "cover",
    index: 1,
  };
}
