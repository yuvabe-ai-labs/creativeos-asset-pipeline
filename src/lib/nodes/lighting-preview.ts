// Presentational helpers for the visual Lighting selector — sibling of composition-preview.ts.
// Pure and React-free so the LightingSelect component stays thin markup and these can be
// unit-tested in the node env. No prompt/data/API impact: option values come straight from
// SHOT_CONTROLS (single source of truth). Each lighting mood is a distinct photo, so this maps
// option value -> its own image under /public/lights.

import { SHOT_CONTROLS, type ShotControlOption } from "./shot-controls";

const LIGHTING_OPTIONS: ShotControlOption[] =
  SHOT_CONTROLS.find((g) => g.key === "lighting")?.options ?? [];

// The five lighting tiles, in order — Auto is pulled out into a header chip, not a tile.
export const LIGHTING_TILES: ShotControlOption[] = LIGHTING_OPTIONS.filter(
  (o) => o.value !== "auto",
);

// The Auto option (drives the header chip's label).
export const LIGHTING_AUTO: ShotControlOption =
  LIGHTING_OPTIONS.find((o) => o.value === "auto") ?? { value: "auto", label: "Auto", prose: "" };

// Option value -> representative photo. Filenames the operator dropped in /public/lights.
export const LIGHTING_IMAGES: Record<string, string> = {
  "soft-daylight": "/lights/window-daylight.png",
  "golden-hour": "/lights/golden-hour.png",
  chiaroscuro: "/lights/dramatic-chiaroscuro.png",
  "studio-softbox": "/lights/studio.png",
  candlelit: "/lights/candle-lit.png",
};

// Terse one-word tile label (the full labels like "Soft window daylight" are too long under a tile).
export const LIGHTING_TILE_LABELS: Record<string, string> = {
  "soft-daylight": "Daylight",
  "golden-hour": "Golden",
  chiaroscuro: "Dramatic",
  "studio-softbox": "Studio",
  candlelit: "Candlelit",
};

// Short descriptor shown in the caption under the strip. UI-only presentational copy.
export const LIGHTING_DESCRIPTORS: Record<string, string> = {
  "soft-daylight": "Soft and even",
  "golden-hour": "Warm and inviting",
  chiaroscuro: "Moody, high contrast",
  "studio-softbox": "Clean and controlled",
  candlelit: "Warm ambience",
  auto: "lighting chosen by the model",
};

// "When would I reach for this?" hint shown in each tile's tooltip. Grounded in product-photography
// practice (daylight = even/flattering; golden = warm/premium lifestyle; chiaroscuro = shadow +
// contrast drama; softbox = controlled studio, tames glare; candlelit = intimate warmth).
export const LIGHTING_TOOLTIPS: Record<string, string> = {
  "soft-daylight":
    "Soft, even daylight — clean and flattering, no harsh shadows. The safe everyday look.",
  "golden-hour": "Warm, low sun — fresh and premium, an inviting lifestyle glow.",
  chiaroscuro: "Deep shadow and high contrast — moody, dramatic, and dimensional.",
  "studio-softbox": "Broad, even studio light — controlled and professional; tames glare on gloss.",
  candlelit: "Warm, flickering ambience — intimate and atmospheric.",
  auto: "Let the model choose the lighting for you.",
};

// Full option label ("Golden hour") from the shot-controls source.
export function lightingLabel(value: string): string {
  return LIGHTING_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Representative photo for a lighting tile. "" for auto/unknown (no image).
export function lightingImage(value: string): string {
  return LIGHTING_IMAGES[value] ?? "";
}

// Terse label under each tile. Falls back to the full label for unmapped values.
export function lightingTileLabel(value: string): string {
  return LIGHTING_TILE_LABELS[value] ?? lightingLabel(value);
}

// Caption under the strip: "Golden hour · Warm and inviting" / "Auto · lighting chosen by …".
export function lightingCaption(value: string): string {
  const descriptor = LIGHTING_DESCRIPTORS[value] ?? "";
  return descriptor ? `${lightingLabel(value)} · ${descriptor}` : lightingLabel(value);
}

// One-line "when to use this lighting" hint for a tile's tooltip. "" for unknown values.
export function lightingTooltip(value: string): string {
  return LIGHTING_TOOLTIPS[value] ?? "";
}
