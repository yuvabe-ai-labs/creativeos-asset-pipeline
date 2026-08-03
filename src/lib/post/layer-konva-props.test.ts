import { describe, it, expect } from "vitest";
import {
  layerToKonvaProps, textLayerFontProps, shapeLayerFillProps, gradientPoints,
} from "./layer-konva-props";
import { createTextLayer, createShapeLayer } from "./layers";

describe("layerToKonvaProps", () => {
  it("converts normalized geometry to absolute pixel x/y/width/height", () => {
    const layer = createTextLayer({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(layerToKonvaProps(layer, 1000, 2000)).toMatchObject({
      x: 100, y: 400, width: 300, height: 800,
    });
  });

  it("passes rotation through as degrees (Konva's own unit, unlike CSS which needed a string)", () => {
    expect(layerToKonvaProps(createTextLayer({ rotation: 15 }), 1000, 1000).rotation).toBe(15);
    expect(layerToKonvaProps(createTextLayer({ rotation: undefined }), 1000, 1000).rotation).toBe(0);
  });

  it("defaults opacity to 1 when unset", () => {
    expect(layerToKonvaProps(createTextLayer({ opacity: undefined }), 1000, 1000).opacity).toBe(1);
  });

  it("hidden -> visible:false, locked -> listening:false", () => {
    expect(layerToKonvaProps(createTextLayer({ hidden: true }), 1000, 1000).visible).toBe(false);
    expect(layerToKonvaProps(createTextLayer({ hidden: false }), 1000, 1000).visible).toBe(true);
    expect(layerToKonvaProps(createTextLayer({ locked: true }), 1000, 1000).listening).toBe(false);
    expect(layerToKonvaProps(createTextLayer({ locked: false }), 1000, 1000).listening).toBe(true);
  });
});

describe("textLayerFontProps", () => {
  it("scales fontSize against container height and maps fontWeight to Konva's fontStyle token", () => {
    const bold = createTextLayer({ fontSize: 0.05, fontWeight: 700, color: "#111", align: "center", lineHeight: 1.4 });
    expect(textLayerFontProps(bold, 1000)).toEqual({
      fontFamily: bold.fontFamily,
      fontSize: 50,
      fontStyle: "bold",
      fill: "#111",
      align: "center",
      lineHeight: 1.4,
      letterSpacing: undefined,
    });
  });

  it("fontWeight below 600 maps to normal", () => {
    expect(textLayerFontProps(createTextLayer({ fontWeight: 400 }), 1000).fontStyle).toBe("normal");
  });
});

describe("gradientPoints", () => {
  it("0deg (top-to-bottom, this app's convention) runs from local top-center to bottom-center", () => {
    const { start, end } = gradientPoints(0, 200, 100);
    expect(start).toEqual({ x: 100, y: 0 });
    expect(end).toEqual({ x: 100, y: 100 });
  });

  it("180deg is the reverse (bottom-center to top-center)", () => {
    const { start, end } = gradientPoints(180, 200, 100);
    expect(start).toEqual({ x: 100, y: 100 });
    expect(end).toEqual({ x: 100, y: 0 });
  });

  it("90deg runs left-center to right-center", () => {
    const { start, end } = gradientPoints(90, 200, 100);
    expect(start).toEqual({ x: 0, y: 50 });
    expect(end).toEqual({ x: 200, y: 50 });
  });
});

describe("shapeLayerFillProps", () => {
  it("a solid fill maps to Konva's fill + cornerRadius", () => {
    const layer = createShapeLayer({ fill: { kind: "solid", color: "#5829c7" }, radius: 12 });
    expect(shapeLayerFillProps(layer, 200, 100)).toEqual({ fill: "#5829c7", cornerRadius: 12 });
  });

  it("a gradient fill maps to Konva's linear-gradient props with local-space points", () => {
    const layer = createShapeLayer({
      fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.72)", angle: 0 },
      radius: 0,
    });
    const props = shapeLayerFillProps(layer, 400, 200);
    expect(props.fillLinearGradientStartPoint).toEqual({ x: 200, y: 0 });
    expect(props.fillLinearGradientEndPoint).toEqual({ x: 200, y: 200 });
    expect(props.fillLinearGradientColorStops).toEqual([0, "rgba(0,0,0,0)", 1, "rgba(0,0,0,0.72)"]);
    expect(props.cornerRadius).toBe(0);
  });
});
