import { CAPTION_FONT_COVERAGE } from "./caption-font-coverage";

// The caption fonts (D392): a fixed list of open-licence Google Fonts. They are reel content,
// not interface: they render only in captions on the editor's stage and ship in the Premiere
// package (src/fonts/captions/), so what the user sees is what Premiere shows.

export const CAPTION_FONTS = [
  { key: "montserrat", label: "Montserrat", postScript: "Montserrat-ExtraBold", file: "Montserrat-ExtraBold.ttf", licence: "Montserrat-OFL.txt" },
  { key: "poppins", label: "Poppins", postScript: "Poppins-Bold", file: "Poppins-Bold.ttf", licence: "Poppins-OFL.txt" },
  { key: "bebas-neue", label: "Bebas Neue", postScript: "BebasNeue-Regular", file: "BebasNeue-Regular.ttf", licence: "BebasNeue-OFL.txt" },
  { key: "anton", label: "Anton", postScript: "Anton-Regular", file: "Anton-Regular.ttf", licence: "Anton-OFL.txt" },
  { key: "playfair-display", label: "Playfair Display", postScript: "PlayfairDisplay-Bold", file: "PlayfairDisplay-Bold.ttf", licence: "PlayfairDisplay-OFL.txt" },
] as const;

export type CaptionFont = (typeof CAPTION_FONTS)[number];
export type CaptionFontKey = CaptionFont["key"];

export const CAPTION_FONT_KEYS: readonly CaptionFontKey[] = CAPTION_FONTS.map((f) => f.key);

/** A new caption's look. `size` is px on a frame 1080 px on its short edge (the D123 convention). */
export const CAPTION_DEFAULTS = { font: "montserrat", size: 84, color: "#ffffff", x: 0.5, y: 0.82, duration: 2 } as const;

export function captionFont(key: CaptionFontKey): CaptionFont {
  return CAPTION_FONTS.find((f) => f.key === key) ?? CAPTION_FONTS[0];
}

const ALWAYS_DRAWN = /\s/u;

function covers(key: CaptionFontKey, codepoint: number): boolean {
  const ranges = CAPTION_FONT_COVERAGE[key];
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (codepoint < ranges[mid][0]) hi = mid - 1;
    else if (codepoint > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** The characters of `text` the font has no letter for (each once), from its own cmap. Premiere
 *  and the stage would both substitute another font for these. */
export function missingChars(key: CaptionFontKey, text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (!ALWAYS_DRAWN.test(ch) && !covers(key, ch.codePointAt(0)!)) missing.add(ch);
  }
  return [...missing];
}

/** False when the font lacks any letter of the text, in any script. */
export function fontCoversText(key: CaptionFontKey, text: string): boolean {
  return missingChars(key, text).length === 0;
}

/** The caption fonts that can draw all of `text`. */
export function coveringFonts(text: string): CaptionFontKey[] {
  return CAPTION_FONT_KEYS.filter((k) => fontCoversText(k, text));
}
