import { describe, it, expect } from "vitest";
import { FONT_DEFINITIONS, DEFAULT_FONT, hasTamilText, resolveFontKey, type FontKey } from "./fonts";

describe("FONT_DEFINITIONS", () => {
  it("every non-Tamil family declares a Tamil companion that exists in the registry", () => {
    for (const def of Object.values(FONT_DEFINITIONS)) {
      expect(FONT_DEFINITIONS[def.tamilCompanion]).toBeDefined();
    }
  });

  it("DEFAULT_FONT is a real registry entry", () => {
    expect(FONT_DEFINITIONS[DEFAULT_FONT]).toBeDefined();
  });

  it("has at least six curated Latin families plus their Tamil companions", () => {
    expect(Object.keys(FONT_DEFINITIONS).length).toBeGreaterThanOrEqual(8);
  });
});

describe("hasTamilText", () => {
  it("detects Tamil script characters", () => {
    expect(hasTamilText("தீபாவளி வாழ்த்துக்கள்")).toBe(true);
  });
  it("is false for Latin-only text", () => {
    expect(hasTamilText("Diwali Offer")).toBe(false);
  });
  it("is true for mixed Latin+Tamil text", () => {
    expect(hasTamilText("Diwali தீபாவளி")).toBe(true);
  });
  it("is false for an empty string", () => {
    expect(hasTamilText("")).toBe(false);
  });
});

describe("resolveFontKey", () => {
  it("returns the picked family unchanged for Latin text", () => {
    expect(resolveFontKey("playfair-display", "Diwali Offer")).toBe("playfair-display");
  });

  it("falls back to the family's Tamil companion for Tamil text — a brand's Latin font has no Tamil glyphs at all", () => {
    const resolved = resolveFontKey("playfair-display", "தீபாவளி");
    expect(resolved).toBe(FONT_DEFINITIONS["playfair-display"].tamilCompanion);
    expect(resolved).not.toBe("playfair-display");
  });

  it("falls back to DEFAULT_FONT's companion for an unknown fontKey", () => {
    const resolved = resolveFontKey("not-a-real-key" as FontKey, "தமிழ்");
    expect(resolved).toBe(FONT_DEFINITIONS[DEFAULT_FONT].tamilCompanion);
  });
});
