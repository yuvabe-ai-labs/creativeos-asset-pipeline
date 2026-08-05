import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "numbered-tips";
export const name = "Numbered tips";
export const purposeTags = ["education", "listicle"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.62 };

// A numbered list on flat colour. Listicles are the most-saved content type, and saves are
// what the algorithm actually rewards — so the numbers need to be scannable, not pretty.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const listTop = byBand(band, { portrait: 0.34, square: 0.32, landscape: 0.28 });
  const rowGap = byBand(band, { portrait: 0.13, square: 0.12, landscape: 0.14 });
  const titleSize = byBand(band, { portrait: 0.05, square: 0.048, landscape: 0.056 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#0f172a" }, radius: 0, locked: true,
  });
  const title = createTextLayer({
    name: "Title", x: m, y: 0.14, w: 1 - m * 2, h: 0.12,
    text: "3 ways to get started", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const rows = [1, 2, 3].flatMap((n, i) => {
    const y = listTop + i * rowGap;
    return [
      createTextLayer({
        name: `Tip ${n} number`, x: m, y, w: 0.08, h: 0.06,
        text: String(n), fontSize: 0.042, fontWeight: 700, color: "#ffca2d",
      }),
      createTextLayer({
        name: `Tip ${n} text`, x: m + 0.1, y, w: 1 - m * 2 - 0.1, h: 0.08,
        text: "The tip itself, in one short line", fontSize: 0.024, fontWeight: 500,
        lineHeight: 1.35, color: "rgba(255,255,255,0.9)",
      }),
    ];
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.38, h: 0.05,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Save this post", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([background, title, ...rows, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
