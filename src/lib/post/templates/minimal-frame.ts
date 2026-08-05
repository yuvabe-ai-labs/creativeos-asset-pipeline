import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "minimal-frame";
export const name = "Minimal frame";
export const purposeTags = ["editorial", "brand"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.2 };

// A generous white frame with one quiet caption. The restrained option — closest to this
// app's own "light editorial premium" language, and the one that flatters a good photo.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  // The frame is a fraction of the SHORTER edge conceptually; a landscape post needs a
  // thinner band or the photo disappears.
  const inset = byBand(band, { portrait: 0.07, square: 0.07, landscape: 0.05 });
  const captionTop = byBand(band, { portrait: 0.84, square: 0.83, landscape: 0.8 });

  const frame = createShapeLayer({
    name: "Frame", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#ffffff" }, radius: 0, locked: true,
  });
  const plate = createShapeLayer({
    name: "Photo plate", x: inset, y: inset, w: 1 - inset * 2, h: captionTop - inset * 2,
    fill: { kind: "solid", color: "#e9e7e2" }, radius: 4,
  });
  const caption = createTextLayer({
    name: "Caption", x: inset, y: captionTop, w: 1 - inset * 2, h: 0.05,
    text: "A quiet line about this picture", fontSize: 0.024, fontWeight: 500, color: "#1e1e1e",
  });
  const meta = createTextLayer({
    name: "Meta", x: inset, y: captionTop + 0.055, w: 1 - inset * 2, h: 0.035,
    text: "STUDIO NOTES", fontSize: 0.016, fontWeight: 600, letterSpacing: 3, color: "#9ca3af",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - inset - 0.3, y: captionTop + 0.045, w: 0.3, h: 0.045,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See the series", fontSize: 0.017, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([frame, plate, caption, meta, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
