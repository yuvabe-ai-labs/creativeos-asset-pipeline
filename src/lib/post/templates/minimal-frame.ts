import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "minimal-frame";
export const name = "Minimal frame";
export const purposeTags = ["editorial", "brand"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.2 };

// Where the photo plate sits — a fraction of the SHORTER edge conceptually, so a landscape
// post gets a thinner frame and the photo doesn't disappear.
function plateBox(format: PostFormat): { x: number; y: number; w: number; h: number } {
  const band = aspectBand(format);
  const inset = byBand(band, { portrait: 0.07, square: 0.07, landscape: 0.05 });
  const captionTop = byBand(band, { portrait: 0.84, square: 0.83, landscape: 0.8 });
  return { x: inset, y: inset, w: 1 - inset * 2, h: captionTop - inset * 2 };
}

// A generous white frame with one quiet caption. The restrained option — closest to this
// app's own "light editorial premium" language, and the one that flatters a good photo.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const inset = byBand(band, { portrait: 0.07, square: 0.07, landscape: 0.05 });
  const captionTop = byBand(band, { portrait: 0.84, square: 0.83, landscape: 0.8 });
  const plate = plateBox(format);

  const frame = createShapeLayer({
    name: "Frame", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#ffffff" }, radius: 0, locked: true,
  });
  const plateShape = createShapeLayer({
    name: "Photo plate", x: plate.x, y: plate.y, w: plate.w, h: plate.h,
    fill: { kind: "solid", color: "#ece8e1" }, radius: 4,
  });
  const meta = createTextLayer({
    name: "Meta", x: inset, y: captionTop, w: 1 - inset * 2, h: 0.03,
    text: "STUDIO NOTES", fontSize: 0.016, fontWeight: 600, letterSpacing: 3, color: "#9ca3af",
  });
  const caption = createTextLayer({
    name: "Caption", x: inset, y: captionTop + 0.035, w: 1 - inset * 2, h: 0.045,
    text: "A quiet line about this picture", fontSize: 0.026, fontWeight: 600, color: "#18181b",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - inset - 0.3, y: captionTop + 0.09, w: 0.3, h: 0.045,
    fill: { kind: "solid", color: "#18181b" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See the series", fontSize: 0.017, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([frame, plateShape, meta, caption, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}

// The plate IS the slot — it's the whole point of this template, a deliberately framed photo
// rather than a bleed. Spliced right after `plateShape` (index 2: frame, plateShape, [photo
// lands here], meta, caption, group) so the real photo covers the placeholder exactly.
export function imageSlot(format: PostFormat): ImageSlot {
  const plate = plateBox(format);
  return { x: plate.x, y: plate.y, w: plate.w, h: plate.h, fit: "cover", radius: 4, index: 2 };
}
