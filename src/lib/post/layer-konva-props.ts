import type { PostLayer, TextLayer, ShapeLayer } from "./types";
import { normalizedToPx, fontSizeToPx } from "./units";

export type KonvaGeometryProps = {
  x: number; y: number; width: number; height: number;
  rotation: number; opacity: number; visible: boolean; listening: boolean;
};

// Shared geometry every layer kind gets, converted to Konva's own prop names/units:
// rotation in plain degrees (no CSS transform string needed), `visible`/`listening`
// instead of display/pointerEvents. This is what post-layer-render.tsx spreads onto
// every Konva shape — both in the editor stage and at export time (same Stage instance).
export function layerToKonvaProps(
  layer: PostLayer, containerW: number, containerH: number,
): KonvaGeometryProps {
  return {
    x: normalizedToPx(layer.x, containerW),
    y: normalizedToPx(layer.y, containerH),
    width: normalizedToPx(layer.w, containerW),
    height: normalizedToPx(layer.h, containerH),
    rotation: layer.rotation ?? 0,
    opacity: layer.opacity ?? 1,
    visible: !layer.hidden,
    listening: !layer.locked,
  };
}

export type KonvaTextProps = {
  fontFamily: string;
  fontSize: number;
  fontStyle: "bold" | "normal";
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: number;
};

// Konva's Text node has no numeric font-weight — fontStyle is a string token combining
// bold/italic. This app's TextLayer.fontWeight (a CSS-style number) collapses to bold
// at 600+ (semibold and up reads as "bold" at poster sizes) or normal below it.
export function textLayerFontProps(
  layer: TextLayer, containerW: number, containerH: number,
): KonvaTextProps {
  return {
    fontFamily: layer.fontFamily,
    fontSize: fontSizeToPx(layer.fontSize, containerW, containerH),
    fontStyle: layer.fontWeight >= 600 ? "bold" : "normal",
    fill: layer.color,
    align: layer.align,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
  };
}

export type Point = { x: number; y: number };

// Konva gradient points are in the shape's own LOCAL coordinate space (0,0 = the
// shape's own top-left), unlike CSS's one-line `linear-gradient(angle, ...)` which
// needs no such conversion. This app's angle convention matches CSS: 0deg = top-to-
// bottom, 90deg = left-to-right, clockwise. Exact at the four cardinal angles — the
// only angles any V1 template actually uses (Task 7's templates are all 0deg scrims/
// blocks); other angles fall back to a diagonal-reach approximation, visually
// reasonable but not pixel-exact at the rectangle's edge for non-square shapes.
export function gradientPoints(angle: number, widthPx: number, heightPx: number): { start: Point; end: Point } {
  const normalized = ((angle % 360) + 360) % 360;
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  if (normalized === 0) return { start: { x: cx, y: 0 }, end: { x: cx, y: heightPx } };
  if (normalized === 90) return { start: { x: 0, y: cy }, end: { x: widthPx, y: cy } };
  if (normalized === 180) return { start: { x: cx, y: heightPx }, end: { x: cx, y: 0 } };
  if (normalized === 270) return { start: { x: widthPx, y: cy }, end: { x: 0, y: cy } };
  const rad = (normalized * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = Math.cos(rad);
  const reach = Math.sqrt(cx * cx + cy * cy);
  return {
    start: { x: cx - dx * reach, y: cy - dy * reach },
    end: { x: cx + dx * reach, y: cy + dy * reach },
  };
}

export type KonvaShapeFillProps = {
  fill?: string;
  fillLinearGradientStartPoint?: Point;
  fillLinearGradientEndPoint?: Point;
  fillLinearGradientColorStops?: (number | string)[];
  cornerRadius: number;
  stroke?: string;
  strokeWidth?: number;
};

// layer.stroke is optional (Task-prior addition to ShapeLayer) — when set, Konva's Rect
// takes its own stroke/strokeWidth props alongside fill, so this passes both through
// regardless of whether the fill itself is solid or gradient.
export function shapeLayerFillProps(layer: ShapeLayer, widthPx: number, heightPx: number): KonvaShapeFillProps {
  const { fill, stroke } = layer;
  const strokeProps = stroke ? { stroke: stroke.color, strokeWidth: stroke.width } : {};
  if (fill.kind === "solid") {
    return { fill: fill.color, cornerRadius: layer.radius, ...strokeProps };
  }
  const { start, end } = gradientPoints(fill.angle, widthPx, heightPx);
  return {
    fillLinearGradientStartPoint: start,
    fillLinearGradientEndPoint: end,
    fillLinearGradientColorStops: [0, fill.from, 1, fill.to],
    cornerRadius: layer.radius,
    ...strokeProps,
  };
}
