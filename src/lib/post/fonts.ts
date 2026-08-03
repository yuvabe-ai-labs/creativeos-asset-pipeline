// A curated list of Latin webfonts, each paired with a Tamil companion (R6.2 — every
// font declares a Tamil companion for fallback, since a brand's Latin font almost
// certainly has no Tamil glyphs at all: Playfair Display has none). The actual
// next/font/google loader calls live in post-fonts.tsx (see Task 9's file-split note) —
// this file is pure data + the Latin/Tamil decision logic, so it's unit-testable.
export type FontKey =
  | "playfair-display"
  | "poppins"
  | "inter"
  | "merriweather"
  | "bebas-neue"
  | "libre-baskerville"
  | "noto-sans-tamil"
  | "noto-serif-tamil";

export type FontDefinition = {
  key: FontKey;
  label: string;
  tamilCompanion: FontKey;
};

export const FONT_DEFINITIONS: Record<FontKey, FontDefinition> = {
  "playfair-display": { key: "playfair-display", label: "Playfair Display", tamilCompanion: "noto-serif-tamil" },
  "poppins":          { key: "poppins",          label: "Poppins",          tamilCompanion: "noto-sans-tamil" },
  "inter":            { key: "inter",            label: "Inter",            tamilCompanion: "noto-sans-tamil" },
  "merriweather":     { key: "merriweather",     label: "Merriweather",     tamilCompanion: "noto-serif-tamil" },
  "bebas-neue":       { key: "bebas-neue",       label: "Bebas Neue",       tamilCompanion: "noto-sans-tamil" },
  "libre-baskerville":{ key: "libre-baskerville",label: "Libre Baskerville",tamilCompanion: "noto-serif-tamil" },
  "noto-sans-tamil":  { key: "noto-sans-tamil",  label: "Noto Sans Tamil",  tamilCompanion: "noto-sans-tamil" },
  "noto-serif-tamil": { key: "noto-serif-tamil", label: "Noto Serif Tamil", tamilCompanion: "noto-serif-tamil" },
};

export const DEFAULT_FONT: FontKey = "inter";

// Unicode Tamil block: U+0B80-U+0BFF.
const TAMIL_RANGE = /[஀-௿]/;

export function hasTamilText(text: string): boolean {
  return TAMIL_RANGE.test(text);
}

// Resolve which font KEY should actually render for a layer's chosen font + its text
// content. Tamil text always renders through the companion — visibly (the operator
// sees which font is in use; it is not a silent substitution, R6.2) — never the
// original Latin family, which would render as empty boxes.
export function resolveFontKey(fontKey: FontKey, text: string): FontKey {
  const def = FONT_DEFINITIONS[fontKey] ?? FONT_DEFINITIONS[DEFAULT_FONT];
  return hasTamilText(text) ? def.tamilCompanion : def.key;
}
