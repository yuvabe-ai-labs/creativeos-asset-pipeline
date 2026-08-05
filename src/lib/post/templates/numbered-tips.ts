import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "numbered-tips";
export const name = "Numbered tips";
export const purposeTags = ["education", "listicle"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.62 };

// A numbered list over a dimmed photo. Listicles are the most-saved content type, and saves
// are what the algorithm actually rewards — so the numbers need to be scannable first, and
// a real photo behind them (rather than flat colour) is what makes the save worth making.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const listTop = byBand(band, { portrait: 0.34, square: 0.32, landscape: 0.28 });
  const rowGap = byBand(band, { portrait: 0.13, square: 0.12, landscape: 0.14 });
  const titleSize = byBand(band, { portrait: 0.052, square: 0.05, landscape: 0.058 });

  // Full-canvas tint so the composition still reads as intentional with no photo connected
  // (see imageSlot, which splices the photo in behind this), and stays legible over any photo.
  const dim = createShapeLayer({
    name: "Dim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "gradient", from: "rgba(15,23,42,0.55)", to: "rgba(15,23,42,0.92)", angle: 0 },
    radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: 0.095, w: 1 - m * 2, h: 0.032,
    text: "WORTH SAVING", fontSize: 0.02, fontWeight: 700, letterSpacing: 3, color: "#ffca2d",
  });
  const title = createTextLayer({
    name: "Title", x: m, y: 0.14, w: 1 - m * 2, h: 0.12,
    text: "3 ways to get started", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const rows = [1, 2, 3].flatMap((n, i) => {
    const y = listTop + i * rowGap;
    const badge = createShapeLayer({
      name: `Tip ${n} badge`, x: m, y, w: 0.085, h: 0.085,
      fill: { kind: "solid", color: "rgba(255,255,255,0.1)" }, radius: 12,
      stroke: { color: "rgba(255,255,255,0.18)", width: 1 },
    });
    const number = createTextLayer({
      name: `Tip ${n} number`, x: badge.x, y: badge.y, w: badge.w, h: badge.h,
      text: String(n), fontSize: 0.034, fontWeight: 700, color: "#ffca2d", align: "center",
    });
    const text = createTextLayer({
      name: `Tip ${n} text`, x: m + 0.12, y, w: 1 - m * 2 - 0.12, h: badge.h,
      text: "One clear, actionable tip goes here", fontSize: 0.022, fontWeight: 500,
      lineHeight: 1.35, color: "rgba(255,255,255,0.92)",
    });
    return [badge, number, text];
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.38, h: 0.05,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Save this post", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([dim, eyebrow, title, ...rows, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}

// A background, not a framed inset — with copy running the full height of the frame (title
// through three rows), the photo has to sit behind everything and let the dim tint carry
// legibility, rather than compete for a smaller box of its own.
export function imageSlot(_format: PostFormat): ImageSlot {
  return { x: 0, y: 0, w: 1, h: 1, fit: "cover", index: 0 };
}
