import type { PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import type { CopyZone } from "../copy-zone-hint";

export const id = "inset-card";
export const name = "Inset card";
export const purposeTags = ["launch", "announcement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.43 };

// Image floats inset on a brand-coloured field; copy sits on the solid, never on the
// photo — contrast is guaranteed and no scrim is needed. The most "designed" of the set.
export function seedLayers(): PostLayer[] {
  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f4e2d4" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: 0.09, y: 0.6, w: 0.58, h: 0.08,
    text: "Headline", fontSize: 0.042, fontWeight: 700, color: "#1e1e1e",
  });
  const body = createTextLayer({
    name: "Body copy", x: 0.09, y: 0.7, w: 0.76, h: 0.035,
    text: "Body copy goes here", fontSize: 0.02, fontWeight: 400, color: "#52525b",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 0.58, y: 0.85, w: 0.33, h: 0.055,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label",
    x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop Now", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [background, headline, body, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
