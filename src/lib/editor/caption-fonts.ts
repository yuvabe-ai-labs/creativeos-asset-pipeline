// The caption fonts (D392): a fixed list of open-licence Google Fonts. They are reel content,
// not interface: they render only in captions on the editor's stage and ship in the Premiere
// package (src/fonts/captions/), so what the user sees is what Premiere shows.

export const CAPTION_FONTS = [
  { key: "montserrat", label: "Montserrat", postScript: "Montserrat-ExtraBold", file: "Montserrat-ExtraBold.ttf", licence: "Montserrat-OFL.txt", scripts: ["latin"] },
  { key: "poppins", label: "Poppins", postScript: "Poppins-Bold", file: "Poppins-Bold.ttf", licence: "Poppins-OFL.txt", scripts: ["latin", "devanagari"] },
  { key: "bebas-neue", label: "Bebas Neue", postScript: "BebasNeue-Regular", file: "BebasNeue-Regular.ttf", licence: "BebasNeue-OFL.txt", scripts: ["latin"] },
  { key: "anton", label: "Anton", postScript: "Anton-Regular", file: "Anton-Regular.ttf", licence: "Anton-OFL.txt", scripts: ["latin"] },
  { key: "playfair-display", label: "Playfair Display", postScript: "PlayfairDisplay-Bold", file: "PlayfairDisplay-Bold.ttf", licence: "PlayfairDisplay-OFL.txt", scripts: ["latin"] },
] as const;

export type CaptionFont = (typeof CAPTION_FONTS)[number];
export type CaptionFontKey = CaptionFont["key"];

export const CAPTION_FONT_KEYS: readonly CaptionFontKey[] = CAPTION_FONTS.map((f) => f.key);

/** A new caption's look. `size` is px on a frame 1080 px on its short edge (the D123 convention). */
export const CAPTION_DEFAULTS = { font: "montserrat", size: 84, color: "#ffffff", x: 0.5, y: 0.82, duration: 2 } as const;

export function captionFont(key: CaptionFontKey): CaptionFont {
  return CAPTION_FONTS.find((f) => f.key === key) ?? CAPTION_FONTS[0];
}

const DEVANAGARI = /[ऀ-ॿ]/;

/** False when the text needs a script the font has no letters for (Premiere would substitute). */
export function fontCoversText(key: CaptionFontKey, text: string): boolean {
  const scripts: readonly string[] = captionFont(key).scripts;
  return !DEVANAGARI.test(text) || scripts.includes("devanagari");
}
