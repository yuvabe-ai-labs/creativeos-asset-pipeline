import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";
import type { ImageSlot } from "./index";

export const id = "testimonial";
export const name = "Testimonial";
export const purposeTags = ["social-proof", "review"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.55 };

const AVATAR_SIZE = 0.075;

// Reviewer photo is a small circular avatar next to the attribution line, not a full-bleed
// background — a testimonial's job is proving a real person said this, and a big photo
// behind the quote would fight the copy for attention instead of backing it up.
function avatarBox(format: PostFormat): { x: number; y: number; w: number; h: number } {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  return { x: m + 0.045, y: 0.755, w: AVATAR_SIZE, h: AVATAR_SIZE };
}

// A card floating on a warm field: a decorative quote mark, stars, the quote, then who said
// it — with their photo right there. Social proof reads as proof only when the attribution
// is as legible (and as real) as the praise.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const cardTop = byBand(band, { portrait: 0.42, square: 0.38, landscape: 0.3 });
  const quoteSize = byBand(band, { portrait: 0.036, square: 0.034, landscape: 0.04 });
  const avatar = avatarBox(format);

  const field = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#faf7f2" }, radius: 0, locked: true,
  });
  const card = createShapeLayer({
    name: "Card", x: m, y: cardTop, w: 1 - m * 2, h: 0.86 - cardTop,
    fill: { kind: "solid", color: "#ffffff" }, radius: 22,
  });
  const quoteMark = createTextLayer({
    name: "Quote mark", x: m + 0.03, y: cardTop - 0.01, w: 0.18, h: 0.1,
    text: "“", fontSize: 0.085, fontWeight: 700, color: "rgba(88,41,199,0.16)",
  });
  const stars = createTextLayer({
    name: "Stars", x: m + 0.045, y: cardTop + 0.08, w: 0.4, h: 0.035,
    text: "★★★★★", fontSize: 0.024, fontWeight: 700, color: "#ffca2d",
  });
  const quote = createTextLayer({
    name: "Quote", x: m + 0.045, y: cardTop + 0.13, w: 1 - m * 2 - 0.09, h: 0.15,
    text: "Genuinely changed how our team works. Worth every rupee.",
    fontSize: quoteSize, fontWeight: 700, lineHeight: 1.4, color: "#18181b",
  });
  const avatarPlate = createShapeLayer({
    name: "Avatar", x: avatar.x, y: avatar.y, w: avatar.w, h: avatar.h,
    fill: { kind: "solid", color: "#e4e0f7" }, radius: 999,
  });
  const who = createTextLayer({
    name: "Attribution", x: avatar.x + avatar.w + 0.03, y: avatar.y + 0.013, w: 1 - m * 2 - 0.195, h: 0.045,
    text: "Name — Role, Company", fontSize: 0.019, fontWeight: 600, color: "#52525b",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m + 0.045, y: cardTop + 0.38, w: 0.34, h: 0.05,
    fill: { kind: "solid", color: "#18181b" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Read reviews", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [field, card, quoteMark, stars, quote, avatarPlate, who, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}

// A framed element, not a background: the avatar sits where `avatarPlate` (a placeholder
// circle) already is, spliced in right after it so the real photo covers the placeholder
// exactly — index 6 is that position in seedLayers' own array (field, card, quoteMark,
// stars, quote, avatarPlate, [photo lands here], who, group).
export function imageSlot(format: PostFormat): ImageSlot {
  const avatar = avatarBox(format);
  return { x: avatar.x, y: avatar.y, w: avatar.w, h: avatar.h, fit: "cover", radius: 999, index: 6 };
}
