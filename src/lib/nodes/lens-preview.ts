// Presentational helpers for the visual Lens selector (spec:
// docs/superpowers/specs/2026-07-21-visual-lens-selector-design.md). Pure and React-free so the
// LensSelect component stays thin markup and these can be unit-tested in the node env. No
// prompt/data/API impact: option values come straight from SHOT_CONTROLS (single source of truth).

import { SHOT_CONTROLS, type ShotControlOption } from "./shot-controls";

// The demo asset cropped five ways. One constant — swap it to change the shot; nothing else moves.
export const LENS_PREVIEW_SRC = "/lens-preview.png";

const LENS_OPTIONS: ShotControlOption[] =
  SHOT_CONTROLS.find((g) => g.key === "lens")?.options ?? [];

// The five focal-length tiles, in order — Auto is pulled out into a header chip, not a tile.
export const LENS_TILES: ShotControlOption[] = LENS_OPTIONS.filter((o) => o.value !== "auto");

// The Auto option (drives the header chip's label).
export const LENS_AUTO: ShotControlOption =
  LENS_OPTIONS.find((o) => o.value === "auto") ?? { value: "auto", label: "Auto", prose: "" };

// Short descriptor shown in the caption under the strip. UI-only presentational copy.
export const LENS_DESCRIPTORS: Record<string, string> = {
  "wide-24": "Wide angle",
  "wide-35": "Wide",
  "standard-50": "Natural perspective",
  "portrait-85": "Telephoto, shallow depth",
  "macro-100": "Extreme close detail",
  auto: "lens chosen by the model",
};

// "When would I reach for this?" hint shown in each tile's tooltip. One line per focal length,
// grounded in product-photography practice (wide = context but edge distortion; 35 = lifestyle;
// 50 = natural/versatile; 85 = compression + shallow depth for beauty/jewelry; 100 = macro detail).
export const LENS_TOOLTIPS: Record<string, string> = {
  "wide-24": "The whole scene — your product in its setting. Wide, though edges distort up close.",
  "wide-35": "Lifestyle shots — the product with props and breathing room, still natural.",
  "standard-50": "True-to-the-eye perspective — the versatile, safe default.",
  "portrait-85": "Compresses and softens the background — flattering for beauty and jewelry.",
  "macro-100": "Extreme close-up — texture and the label detail you want to emphasize.",
  auto: "Let the model choose the focal length for you.",
};

// Focal length in mm parsed from the option value ("standard-50" -> 50). null for auto/malformed.
// Note: the empty-token guard matters — Number("") is 0, not NaN, so "" would otherwise parse to 0.
export function lensFocalMm(value: string): number | null {
  const token = value.split("-").pop()?.trim() ?? "";
  if (token === "") return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

// CSS zoom for a tile's <img>: how much the lens magnifies vs. the 24mm baseline.
// 24 -> 1.0, 50 -> ~2.08, 100 -> ~4.17. auto/malformed -> 1 (no crop).
export function lensZoom(value: string): number {
  const mm = lensFocalMm(value);
  return mm ? mm / 24 : 1;
}

// Full option label ("Standard 50mm") from the shot-controls source.
export function lensLabel(value: string): string {
  return LENS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Terse label under each tile ("50mm"). Falls back to the full label for non-focal values.
export function lensTileLabel(value: string): string {
  const mm = lensFocalMm(value);
  return mm ? `${mm}mm` : lensLabel(value);
}

// Caption under the strip: "Standard 50mm · Natural perspective" / "Auto · lens chosen by the model".
export function lensCaption(value: string): string {
  const descriptor = LENS_DESCRIPTORS[value] ?? "";
  return descriptor ? `${lensLabel(value)} · ${descriptor}` : lensLabel(value);
}

// One-line "when to use this lens" hint for a tile's tooltip. "" for unknown values.
export function lensTooltip(value: string): string {
  return LENS_TOOLTIPS[value] ?? "";
}
