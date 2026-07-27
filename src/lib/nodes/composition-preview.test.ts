import { describe, it, expect } from "vitest";
import {
  COMPOSITION_TILES,
  COMPOSITION_AUTO,
  compositionImage,
  compositionTileLabel,
  compositionCaption,
  compositionTooltip,
} from "./composition-preview";

describe("COMPOSITION_TILES / COMPOSITION_AUTO", () => {
  it("exposes the five framing tiles, in order, without auto", () => {
    expect(COMPOSITION_TILES.map((o) => o.value)).toEqual([
      "center",
      "negative-space",
      "flat-lay",
      "close-crop",
      "thirds",
    ]);
  });
  it("splits auto out as its own option", () => {
    expect(COMPOSITION_AUTO.value).toBe("auto");
    expect(COMPOSITION_TILES.some((o) => o.value === "auto")).toBe(false);
  });
});

describe("compositionImage", () => {
  it("maps every tile to an image under /composition", () => {
    for (const tile of COMPOSITION_TILES) {
      expect(compositionImage(tile.value)).toMatch(/^\/composition\/.+\.png$/);
    }
  });
  it("maps known values to their specific files", () => {
    expect(compositionImage("center")).toBe("/composition/center.png");
    expect(compositionImage("negative-space")).toBe("/composition/negative.png");
    expect(compositionImage("flat-lay")).toBe("/composition/flat.png");
    expect(compositionImage("close-crop")).toBe("/composition/close-up.png");
    expect(compositionImage("thirds")).toBe("/composition/thirds.png");
  });
  it("returns empty string for unknown values", () => {
    expect(compositionImage("auto")).toBe("");
    expect(compositionImage("nope")).toBe("");
  });
});

describe("compositionTileLabel", () => {
  it("renders a terse one-word label", () => {
    expect(compositionTileLabel("center")).toBe("Center");
    expect(compositionTileLabel("negative-space")).toBe("Negative");
    expect(compositionTileLabel("flat-lay")).toBe("Flat-lay");
    expect(compositionTileLabel("close-crop")).toBe("Close-crop");
    expect(compositionTileLabel("thirds")).toBe("Thirds");
  });
});

describe("compositionCaption", () => {
  it("joins the full label with its descriptor", () => {
    expect(compositionCaption("negative-space")).toBe("Negative space · Room to breathe");
  });
  it("describes auto as model-chosen", () => {
    expect(compositionCaption("auto")).toBe("Auto · composition chosen by the model");
  });
});

describe("compositionTooltip", () => {
  it("gives every framing tile a non-empty usage hint", () => {
    for (const tile of COMPOSITION_TILES) {
      expect(compositionTooltip(tile.value).length).toBeGreaterThan(0);
    }
  });
  it("frames negative space around room and focus", () => {
    expect(compositionTooltip("negative-space")).toMatch(/space|breathe|room/i);
  });
  it("describes auto as model-chosen", () => {
    expect(compositionTooltip("auto")).toMatch(/model/i);
  });
  it("falls back to empty string for unknown values", () => {
    expect(compositionTooltip("nope")).toBe("");
  });
});
