import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "announcement";
export const name = "Announcement";
export const purposeTags = ["launch", "announcement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.45 };

// A badge, a big claim, and a date. Built for "this exists now" rather than "buy this".
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const blockTop = byBand(band, { portrait: 0.55, square: 0.52, landscape: 0.44 });
  const headSize = byBand(band, { portrait: 0.058, square: 0.055, landscape: 0.065 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: blockTop - 0.08, w: 1, h: 1 - blockTop + 0.08,
    fill: { kind: "gradient", from: "rgba(11,15,25,0)", to: "rgba(11,15,25,0.88)", angle: 0 },
    radius: 0,
  });
  const badge = createShapeLayer({
    name: "Badge", x: m, y: blockTop, w: 0.18, h: 0.045,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const badgeText = createTextLayer({
    name: "Badge label", x: badge.x, y: badge.y, w: badge.w, h: badge.h,
    text: "NEW", fontSize: 0.017, fontWeight: 700, letterSpacing: 2,
    color: "#ffffff", align: "center",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: blockTop + 0.07, w: 1 - m * 2, h: 0.14,
    text: "Something worth announcing", fontSize: headSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const date = createTextLayer({
    name: "Date", x: m, y: blockTop + 0.23, w: 1 - m * 2, h: 0.04,
    text: "Live from 12 August", fontSize: 0.021, fontWeight: 400,
    color: "rgba(255,255,255,0.8)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See what's new", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [scrim, badge, badgeText, headline, date, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
