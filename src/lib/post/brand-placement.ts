import type { BrandAssetCategory } from "@/lib/brand-kit/types";
import type { ImageLayer, PostLayer } from "./types";

/** Fraction of canvas WIDTH each category occupies when placed. A logo is a mark beside
 *  the work; a product is the subject of it. */
const WIDTH_FRACTION: Record<Exclude<BrandAssetCategory, "background">, number> = {
  logo: 0.18,
  product: 0.4,
};

/**
 * The box a brand asset lands in.
 *
 * `x`/`y` are returned ONLY for a background. Omitting them for logos and products is what
 * lets `createImageLayer`'s existing cascade supply the position on a click, and lets the
 * drop path overwrite it with the cursor point — the same split every other element kind
 * already uses.
 */
export function brandAssetGeometry(
  category: BrandAssetCategory,
  containerW: number,
  containerH: number,
): { x?: number; y?: number; w: number; h: number } {
  if (category === "background") return { x: 0, y: 0, w: 1, h: 1 };

  const w = WIDTH_FRACTION[category];
  // `w` is a fraction of width and `h` of height, so equal values are only square on a
  // square canvas — scale h by the container's aspect to get equal PIXELS. A container
  // that has not been measured yet has no aspect to correct by; fall back to w rather
  // than dividing by zero and writing NaN into the layer.
  const h = containerH > 0 ? (w * containerW) / containerH : w;
  return { w, h };
}

/**
 * Insert `background` at the back of the stack, replacing any previous brand background
 * (D133).
 *
 * Only the top level is searched. A brand background is always placed there, so a marked
 * layer inside a group is one the operator deliberately grouped — reaching into groups to
 * delete it would undo their work.
 */
export function applyBrandBackground(
  layers: PostLayer[],
  background: ImageLayer,
): PostLayer[] {
  const kept = layers.filter(
    (l) => !(l.kind === "image" && l.role === "brand-background"),
  );
  return [background, ...kept];
}
