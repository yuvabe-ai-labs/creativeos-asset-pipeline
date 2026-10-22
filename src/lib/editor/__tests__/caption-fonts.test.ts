import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPTION_FONT_KEYS, CAPTION_FONTS, captionFont, coveringFonts, fontCoversText, missingChars } from "../caption-fonts";
import { CAPTION_FONT_COVERAGE } from "../caption-font-coverage";
import { codepointRanges, readCmapCodepoints, readPostScriptName } from "../font-name";

const DIR = path.join(process.cwd(), "src/fonts/captions");

describe("caption fonts", () => {
  it.each(CAPTION_FONTS.map((f) => [f.key, f] as const))("ships %s with its licence and the PostScript name Premiere is told", (_key, font) => {
    expect(existsSync(path.join(DIR, font.licence))).toBe(true);
    const bytes = new Uint8Array(readFileSync(path.join(DIR, font.file)));
    expect(readPostScriptName(bytes)).toBe(font.postScript);
  });

  it("lists five fonts, the default among them", () => {
    expect(CAPTION_FONT_KEYS).toHaveLength(5);
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

  it("knows coverage from the font files themselves", () => {
    for (const font of CAPTION_FONTS) {
      const cps = readCmapCodepoints(new Uint8Array(readFileSync(path.join(DIR, font.file))));
      expect(CAPTION_FONT_COVERAGE[font.key]).toEqual(codepointRanges(cps));
    }
  });

  it("warns for any letter a font lacks, in every script", () => {
    expect(fontCoversText("montserrat", "தமிழ்")).toBe(false);
    expect(fontCoversText("poppins", "தமிழ்")).toBe(false);
    expect(fontCoversText("anton", "₹499")).toBe(true);
    expect(fontCoversText("playfair-display", "₹499")).toBe(false);
    expect(missingChars("playfair-display", "₹ ok\n₹")).toEqual(["₹"]);
    expect(fontCoversText("montserrat", "Hello,\nworld")).toBe(true);
  });

  it("names the fonts that cover a text, if any", () => {
    expect(coveringFonts("नमस्ते")).toEqual(["poppins"]);
    expect(coveringFonts("தமிழ்")).toEqual([]);
    expect(coveringFonts("Hi")).toHaveLength(5);
  });
});
