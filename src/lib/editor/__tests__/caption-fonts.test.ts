import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPTION_DEFAULTS, CAPTION_FONT_KEYS, CAPTION_FONTS, captionFont, fontCoversText } from "../caption-fonts";
import { readPostScriptName } from "../font-name";

const DIR = path.join(process.cwd(), "src/fonts/captions");

describe("caption fonts", () => {
  it.each(CAPTION_FONTS.map((f) => [f.key, f] as const))("ships %s with its licence and the PostScript name Premiere is told", (_key, font) => {
    expect(existsSync(path.join(DIR, font.licence))).toBe(true);
    const bytes = new Uint8Array(readFileSync(path.join(DIR, font.file)));
    expect(readPostScriptName(bytes)).toBe(font.postScript);
  });

  it("lists five fonts, the default among them", () => {
    expect(CAPTION_FONT_KEYS).toHaveLength(5);
    expect(CAPTION_FONT_KEYS).toContain(CAPTION_DEFAULTS.font);
    expect(captionFont("anton").postScript).toBe("Anton-Regular");
  });

  it("knows which fonts cover Devanagari", () => {
    expect(fontCoversText("montserrat", "नमस्ते")).toBe(false);
    expect(fontCoversText("poppins", "नमस्ते")).toBe(true);
    expect(fontCoversText("anton", "Hello")).toBe(true);
  });

  it("reads no name from bytes that aren't a font", () => {
    expect(readPostScriptName(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
