import { describe, it, expect } from "vitest";
import {
  LIGHTING_TILES,
  LIGHTING_AUTO,
  lightingImage,
  lightingTileLabel,
  lightingCaption,
  lightingTooltip,
} from "./lighting-preview";

describe("LIGHTING_TILES / LIGHTING_AUTO", () => {
  it("exposes the five lighting tiles, in order, without auto", () => {
    expect(LIGHTING_TILES.map((o) => o.value)).toEqual([
      "soft-daylight",
      "golden-hour",
      "chiaroscuro",
      "studio-softbox",
      "candlelit",
    ]);
  });
  it("splits auto out as its own option", () => {
    expect(LIGHTING_AUTO.value).toBe("auto");
    expect(LIGHTING_TILES.some((o) => o.value === "auto")).toBe(false);
  });
});

describe("lightingImage", () => {
  it("maps every tile to an image under /lights", () => {
    for (const tile of LIGHTING_TILES) {
      expect(lightingImage(tile.value)).toMatch(/^\/lights\/.+\.png$/);
    }
  });
  it("maps known values to their specific files", () => {
    expect(lightingImage("soft-daylight")).toBe("/lights/window-daylight.png");
    expect(lightingImage("golden-hour")).toBe("/lights/golden-hour.png");
    expect(lightingImage("chiaroscuro")).toBe("/lights/dramatic-chiaroscuro.png");
    expect(lightingImage("studio-softbox")).toBe("/lights/studio.png");
    expect(lightingImage("candlelit")).toBe("/lights/candle-lit.png");
  });
  it("returns empty string for unknown values", () => {
    expect(lightingImage("auto")).toBe("");
    expect(lightingImage("nope")).toBe("");
  });
});

describe("lightingTileLabel", () => {
  it("renders a terse one-word label", () => {
    expect(lightingTileLabel("soft-daylight")).toBe("Daylight");
    expect(lightingTileLabel("golden-hour")).toBe("Golden");
    expect(lightingTileLabel("chiaroscuro")).toBe("Dramatic");
    expect(lightingTileLabel("studio-softbox")).toBe("Studio");
    expect(lightingTileLabel("candlelit")).toBe("Candlelit");
  });
});

describe("lightingCaption", () => {
  it("joins the full label with its descriptor", () => {
    expect(lightingCaption("golden-hour")).toBe("Golden hour · Warm and inviting");
  });
  it("describes auto as model-chosen", () => {
    expect(lightingCaption("auto")).toBe("Auto · lighting chosen by the model");
  });
});

describe("lightingTooltip", () => {
  it("gives every lighting tile a non-empty usage hint", () => {
    for (const tile of LIGHTING_TILES) {
      expect(lightingTooltip(tile.value).length).toBeGreaterThan(0);
    }
  });
  it("frames chiaroscuro around shadow and contrast", () => {
    expect(lightingTooltip("chiaroscuro")).toMatch(/shadow|contrast|dramatic/i);
  });
  it("describes auto as model-chosen", () => {
    expect(lightingTooltip("auto")).toMatch(/model/i);
  });
  it("falls back to empty string for unknown values", () => {
    expect(lightingTooltip("nope")).toBe("");
  });
});
