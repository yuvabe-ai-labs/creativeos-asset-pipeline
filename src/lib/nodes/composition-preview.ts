// Presentational helpers for the visual Composition selector — the sibling of lens-preview.ts.
// Pure and React-free so the CompositionSelect component stays thin markup and these can be
// unit-tested in the node env. No prompt/data/API impact: option values come straight from
// SHOT_CONTROLS (single source of truth). Unlike Lens (one photo, computed crop), each framing
// is a distinct photo, so this maps option value -> its own image under /public/composition.

import { SHOT_CONTROLS, type ShotControlOption } from "./shot-controls";

const COMPOSITION_OPTIONS: ShotControlOption[] =
  SHOT_CONTROLS.find((g) => g.key === "composition")?.options ?? [];

// The five framing tiles, in order — Auto is pulled out into a header chip, not a tile.
export const COMPOSITION_TILES: ShotControlOption[] = COMPOSITION_OPTIONS.filter(
  (o) => o.value !== "auto",
);

// The Auto option (drives the header chip's label).
export const COMPOSITION_AUTO: ShotControlOption =
  COMPOSITION_OPTIONS.find((o) => o.value === "auto") ?? { value: "auto", label: "Auto", prose: "" };

// Option value -> representative photo. Filenames the operator dropped in /public/composition.
export const COMPOSITION_IMAGES: Record<string, string> = {
  center: "/composition/center.png",
  "negative-space": "/composition/negative.png",
  "flat-lay": "/composition/flat.png",
  "close-crop": "/composition/close-up.png",
  thirds: "/composition/thirds.png",
};

// Terse one-word tile label (the full labels like "Flat-lay / overhead" are too long under a tile).
export const COMPOSITION_TILE_LABELS: Record<string, string> = {
  center: "Center",
  "negative-space": "Negative",
  "flat-lay": "Flat-lay",
  "close-crop": "Close-crop",
  thirds: "Thirds",
};

// Short descriptor shown in the caption under the strip. UI-only presentational copy.
export const COMPOSITION_DESCRIPTORS: Record<string, string> = {
  center: "Bold and symmetrical",
  "negative-space": "Room to breathe",
  "flat-lay": "Top-down styled scene",
  "close-crop": "Detail and impact",
  thirds: "Balanced, off-center",
  auto: "composition chosen by the model",
};

// "When would I reach for this?" hint shown in each tile's tooltip. Grounded in product-photography
// practice (center = deliberate/hero; negative space = room + text; flat-lay = editorial top-down;
// close-crop = detail; thirds = balanced off-center default).
export const COMPOSITION_TOOLTIPS: Record<string, string> = {
  center: "Product dead-center — bold and symmetrical. Striking, but use it deliberately.",
  "negative-space":
    "Lots of empty space around the product — clean and premium, with room for text.",
  "flat-lay": "Shot from directly above — an editorial, styled scene that shows everything at once.",
  "close-crop": "Tight crop that fills the frame — maximum detail and impact.",
  thirds: "Product off-center on a third-line — balanced and dynamic, the classic default.",
  auto: "Let the model choose the composition for you.",
};

// Full option label ("Negative space") from the shot-controls source.
export function compositionLabel(value: string): string {
  return COMPOSITION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Representative photo for a framing tile. "" for auto/unknown (no image).
export function compositionImage(value: string): string {
  return COMPOSITION_IMAGES[value] ?? "";
}

// Terse label under each tile. Falls back to the full label for unmapped values.
export function compositionTileLabel(value: string): string {
  return COMPOSITION_TILE_LABELS[value] ?? compositionLabel(value);
}

// Caption under the strip: "Negative space · Room to breathe" / "Auto · composition chosen by …".
export function compositionCaption(value: string): string {
  const descriptor = COMPOSITION_DESCRIPTORS[value] ?? "";
  return descriptor ? `${compositionLabel(value)} · ${descriptor}` : compositionLabel(value);
}

// One-line "when to use this framing" hint for a tile's tooltip. "" for unknown values.
export function compositionTooltip(value: string): string {
  return COMPOSITION_TOOLTIPS[value] ?? "";
}
