import { describe, it, expect } from "vitest";
import {
  LENS_TILES,
  LENS_AUTO,
  lensFocalMm,
  lensZoom,
  lensTileLabel,
  lensCaption,
} from "./lens-preview";

describe("lensFocalMm", () => {
  it("parses the focal length from the option value", () => {
    expect(lensFocalMm("wide-24")).toBe(24);
    expect(lensFocalMm("standard-50")).toBe(50);
    expect(lensFocalMm("macro-100")).toBe(100);
  });
  it("returns null for auto and malformed values", () => {
    expect(lensFocalMm("auto")).toBeNull();
    expect(lensFocalMm("")).toBeNull();
    expect(lensFocalMm("garbage")).toBeNull();
  });
});

describe("lensZoom", () => {
  it("scales by focal length over the 24mm baseline", () => {
    expect(lensZoom("wide-24")).toBe(1);
    expect(lensZoom("standard-50")).toBeCloseTo(2.083, 3);
    expect(lensZoom("macro-100")).toBeCloseTo(4.167, 3);
  });
  it("is 1 (no crop) for auto and malformed values", () => {
    expect(lensZoom("auto")).toBe(1);
    expect(lensZoom("nonsense")).toBe(1);
  });
});

describe("LENS_TILES / LENS_AUTO", () => {
  it("exposes exactly the five focal tiles, in order, without auto", () => {
    expect(LENS_TILES.map((o) => o.value)).toEqual([
      "wide-24",
      "wide-35",
      "standard-50",
      "portrait-85",
      "macro-100",
    ]);
  });
  it("splits auto out as its own option", () => {
    expect(LENS_AUTO.value).toBe("auto");
    expect(LENS_TILES.some((o) => o.value === "auto")).toBe(false);
  });
});

describe("lensTileLabel", () => {
  it("renders the terse focal label", () => {
    expect(lensTileLabel("wide-24")).toBe("24mm");
    expect(lensTileLabel("standard-50")).toBe("50mm");
    expect(lensTileLabel("macro-100")).toBe("100mm");
  });
});

describe("lensCaption", () => {
  it("joins the full label with its descriptor", () => {
    expect(lensCaption("standard-50")).toBe("Standard 50mm · Natural perspective");
    expect(lensCaption("macro-100")).toBe("Macro 100mm · Extreme close detail");
  });
  it("describes auto as model-chosen", () => {
    expect(lensCaption("auto")).toBe("Auto · lens chosen by the model");
  });
});
