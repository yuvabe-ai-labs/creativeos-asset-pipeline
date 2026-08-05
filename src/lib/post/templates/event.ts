import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "event";
export const name = "Event";
export const purposeTags = ["event", "invite"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.48 };

// A date block reads first, then what and where. Events fail when the date is buried in a
// sentence, so it gets its own tile.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const blockTop = byBand(band, { portrait: 0.5, square: 0.47, landscape: 0.38 });
  const titleSize = byBand(band, { portrait: 0.05, square: 0.048, landscape: 0.058 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: blockTop - 0.1, w: 1, h: 1 - blockTop + 0.1,
    fill: { kind: "gradient", from: "rgba(11,15,25,0)", to: "rgba(11,15,25,0.9)", angle: 0 },
    radius: 0,
  });
  const dateTile = createShapeLayer({
    name: "Date tile", x: m, y: blockTop, w: 0.2, h: 0.2,
    fill: { kind: "solid", color: "#ffffff" }, radius: 16,
  });
  const dateDay = createTextLayer({
    name: "Date day", x: dateTile.x, y: dateTile.y + 0.03, w: dateTile.w, h: 0.09,
    text: "12", fontSize: 0.058, fontWeight: 700, color: "#1e1e1e", align: "center",
  });
  const dateMonth = createTextLayer({
    name: "Date month", x: dateTile.x, y: dateTile.y + 0.13, w: dateTile.w, h: 0.04,
    text: "AUG", fontSize: 0.02, fontWeight: 700, letterSpacing: 2,
    color: "#5829c7", align: "center",
  });
  const title = createTextLayer({
    name: "Title", x: m + 0.24, y: blockTop, w: 1 - m * 2 - 0.24, h: 0.11,
    text: "Event name goes here", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const details = createTextLayer({
    name: "Details", x: m + 0.24, y: blockTop + 0.13, w: 1 - m * 2 - 0.24, h: 0.07,
    text: "6:30 PM · Venue, City", fontSize: 0.021, fontWeight: 400,
    lineHeight: 1.4, color: "rgba(255,255,255,0.82)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Reserve a seat", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [scrim, dateTile, dateDay, dateMonth, title, details, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
