import { describe, it, expect } from "vitest";
import {
  deriveShotControlDefaults,
  renderShotControls,
  DEFAULT_SHOT_CONTROLS,
  SHOT_CONTROLS,
} from "./shot-controls";

describe("deriveShotControlDefaults", () => {
  it("maps a wide shot to a wide lens", () => {
    expect(deriveShotControlDefaults("Center-framed wide shot of the product").lens).toBe("wide-24");
  });

  it("maps a macro/close shot to a macro lens + tight crop", () => {
    const d = deriveShotControlDefaults("Ultra macro close-up of an oil drop");
    expect(d.lens).toBe("macro-100");
    expect(d.composition).toBe("close-crop");
  });

  it("maps a plain close-up to the portrait lens", () => {
    expect(deriveShotControlDefaults("A close-up of mature hands").lens).toBe("portrait-85");
  });

  it("derives composition from overhead / flat-lay wording", () => {
    expect(deriveShotControlDefaults("Overhead flat-lay of seven herbs").composition).toBe("flat-lay");
  });

  it("derives lighting from time-of-day / source words", () => {
    expect(deriveShotControlDefaults("warm golden hour light").lighting).toBe("golden-hour");
    expect(deriveShotControlDefaults("a single candle glows").lighting).toBe("candlelit");
    expect(deriveShotControlDefaults("soft diffused window light").lighting).toBe("soft-daylight");
  });

  it("falls back to auto when nothing matches", () => {
    expect(deriveShotControlDefaults("a product on a table")).toEqual(DEFAULT_SHOT_CONTROLS);
  });

  it("only ever returns option values that exist in the catalog", () => {
    const d = deriveShotControlDefaults("ultra macro close-up at golden hour, overhead");
    for (const group of SHOT_CONTROLS) {
      const valid = group.options.map((o) => o.value);
      expect(valid).toContain(d[group.key]);
    }
  });
});

describe("renderShotControls", () => {
  it("returns an empty string when every control is Auto", () => {
    expect(renderShotControls(DEFAULT_SHOT_CONTROLS)).toBe("");
  });

  it("renders only the non-Auto controls as constraint lines", () => {
    const block = renderShotControls({ lens: "wide-24", composition: "auto", lighting: "golden-hour" });
    expect(block).toContain("Shot controls (use these exactly");
    expect(block).toMatch(/Lens: .*24mm/);
    expect(block).toMatch(/Lighting: .*golden-hour/i);
    expect(block).not.toMatch(/Composition:/); // auto is omitted
  });

  it("ignores unknown option values", () => {
    expect(renderShotControls({ lens: "nonsense", composition: "auto", lighting: "auto" })).toBe("");
  });
});
