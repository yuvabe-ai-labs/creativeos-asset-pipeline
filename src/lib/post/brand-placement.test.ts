import { describe, it, expect } from "vitest";
import { brandAssetGeometry, applyBrandBackground } from "./brand-placement";
import { createImageLayer, createShapeLayer } from "./layers";
import type { ImageLayer } from "./types";

/** A 1080x1350 portrait post scaled to fit a laptop — the real numbers, not round ones. */
const PORTRAIT = { w: 430, h: 538 };
const SQUARE = { w: 500, h: 500 };
const LANDSCAPE = { w: 640, h: 360 };

function bg(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return createImageLayer(
    { kind: "url", url: "https://example.test/bg.png" },
    { x: 0, y: 0, w: 1, h: 1, role: "brand-background", ...overrides },
  );
}

describe("brandAssetGeometry", () => {
  it("gives a logo a box that is genuinely square on canvas, not just w===h", () => {
    // w is a fraction of WIDTH and h of HEIGHT, so equal values are only square on a
    // square canvas. Equal PIXELS is the thing that matters.
    const geo = brandAssetGeometry("logo", PORTRAIT.w, PORTRAIT.h);
    expect(geo.w * PORTRAIT.w).toBeCloseTo(geo.h * PORTRAIT.h, 6);
  });

  it("keeps a logo square on every format", () => {
    for (const c of [PORTRAIT, SQUARE, LANDSCAPE]) {
      const geo = brandAssetGeometry("logo", c.w, c.h);
      expect(geo.w * c.w).toBeCloseTo(geo.h * c.h, 6);
    }
  });

  it("makes a product noticeably larger than a logo", () => {
    const logo = brandAssetGeometry("logo", SQUARE.w, SQUARE.h);
    const product = brandAssetGeometry("product", SQUARE.w, SQUARE.h);
    expect(product.w).toBeGreaterThan(logo.w);
  });

  it("keeps a product square on canvas too", () => {
    const geo = brandAssetGeometry("product", LANDSCAPE.w, LANDSCAPE.h);
    expect(geo.w * LANDSCAPE.w).toBeCloseTo(geo.h * LANDSCAPE.h, 6);
  });

  it("omits x/y for logos and products, so the cascade and the drop point can supply them", () => {
    expect(brandAssetGeometry("logo", SQUARE.w, SQUARE.h).x).toBeUndefined();
    expect(brandAssetGeometry("product", SQUARE.w, SQUARE.h).y).toBeUndefined();
  });

  it("gives a background the full canvas, pinned to the origin", () => {
    expect(brandAssetGeometry("background", PORTRAIT.w, PORTRAIT.h))
      .toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("falls back to a square box when the stage has not been measured yet", () => {
    // containerH of 0 would divide by zero and write NaN into the layer's height.
    const geo = brandAssetGeometry("logo", 0, 0);
    expect(Number.isFinite(geo.w)).toBe(true);
    expect(Number.isFinite(geo.h)).toBe(true);
  });
});

describe("applyBrandBackground", () => {
  it("puts the background at the very back", () => {
    const text = createShapeLayer({ name: "block" });
    const result = applyBrandBackground([text], bg());
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("image");
    expect(result[1].id).toBe(text.id);
  });

  it("replaces a previous brand background instead of burying it", () => {
    const first = bg();
    const shape = createShapeLayer();
    const second = bg();
    const result = applyBrandBackground([first, shape], second);
    expect(result).toHaveLength(2);
    expect(result.some((l) => l.id === first.id)).toBe(false);
    expect(result[0].id).toBe(second.id);
  });

  it("leaves an ordinary full-bleed photo alone — only the marked one is replaced", () => {
    // A hero photo the operator sized to full bleed is their work, not a brand background.
    const hero = createImageLayer(
      { kind: "url", url: "https://example.test/hero.png" },
      { x: 0, y: 0, w: 1, h: 1 },
    );
    const result = applyBrandBackground([hero], bg());
    expect(result).toHaveLength(2);
    expect(result.some((l) => l.id === hero.id)).toBe(true);
  });

  it("works on an empty canvas", () => {
    const only = bg();
    expect(applyBrandBackground([], only)).toEqual([only]);
  });

  it("removes a marked background nested nowhere but the top level", () => {
    // Groups are not searched: a brand background is always placed at the top level, so a
    // marked layer inside a group is one the operator deliberately grouped.
    const marked = bg();
    const group = createShapeLayer({ name: "not a group but stands in as a sibling" });
    const result = applyBrandBackground([marked, group], bg());
    expect(result.filter((l) => l.kind === "image" && l.role === "brand-background"))
      .toHaveLength(1);
  });
});
