// src/components/nodes/post-shape-layer.tsx
"use client";

import { Rect, Ellipse, Line, Arrow, Star, Group } from "react-konva";
import type Konva from "konva";
import type { ShapeLayer } from "@/lib/post/types";
import { layerToKonvaProps, shapeLayerFillProps } from "@/lib/post/layer-konva-props";

type Props = {
  layer: ShapeLayer;
  containerW: number;
  containerH: number;
  nodeRef: (node: Konva.Node | null) => void;
  nodeProps: Konva.NodeConfig;
};

/**
 * Non-rectangular primitives are drawn in LOCAL coordinates (0,0 → w,h) inside a Group that
 * carries the layer's real box.
 *
 * Konva positions each shape differently — an Ellipse's x/y is its centre, a Star's is its
 * middle, a Line has no box at all, just a points array — and none of that matches this
 * codebase's top-left `x/y/w/h` layer box. Wrapping gives every kind ONE node shape, so
 * dragging, the Transformer, and commitNodeGeometry's read-back all behave exactly as they
 * already do for a rectangle, with no per-shape special cases anywhere else.
 *
 * A plain rect skips the wrapper: it already matches Konva's own semantics, so every shape
 * layer that existed before this change renders through the identical code path it always did.
 */
export function PostShapeLayer({ layer, containerW, containerH, nodeRef, nodeProps }: Props) {
  const geo = layerToKonvaProps(layer, containerW, containerH);
  const fillProps = shapeLayerFillProps(layer, geo.width, geo.height);
  const shape = layer.shape ?? "rect";

  if (shape === "rect") {
    return <Rect ref={nodeRef} {...geo} {...fillProps} {...nodeProps} />;
  }

  const w = geo.width;
  const h = geo.height;
  // Corner radius only means anything on a rectangle; Konva's other shapes don't take it.
  const { cornerRadius: _cornerRadius, ...paint } = fillProps;
  // A rule or an arrow is defined by its stroke, not a fill, so it borrows the layer's fill
  // colour when no explicit stroke is set — otherwise adding one would draw nothing at all.
  const strokeColour =
    layer.stroke?.color ?? (layer.fill.kind === "solid" ? layer.fill.color : "#1e1e1e");
  const strokeWeight = layer.stroke?.width ?? Math.max(2, h / 6);

  return (
    <Group ref={nodeRef} {...geo} {...nodeProps}>
      {shape === "ellipse" && (
        <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...paint} />
      )}
      {shape === "triangle" && <Line points={[w / 2, 0, w, h, 0, h]} closed {...paint} />}
      {shape === "diamond" && (
        <Line points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]} closed {...paint} />
      )}
      {shape === "star" && (
        <Star
          x={w / 2}
          y={h / 2}
          numPoints={5}
          // Konva's Star is radial, so sizing it off the box's SHORTER half keeps every point
          // inside a non-square box instead of clipping the wide ones.
          innerRadius={Math.min(w, h) / 4}
          outerRadius={Math.min(w, h) / 2}
          {...paint}
        />
      )}
      {shape === "line" && (
        <Line
          points={[0, h / 2, w, h / 2]}
          stroke={strokeColour}
          strokeWidth={strokeWeight}
          lineCap="round"
        />
      )}
      {shape === "arrow" && (
        <Arrow
          points={[0, h / 2, w, h / 2]}
          stroke={strokeColour}
          fill={strokeColour}
          strokeWidth={strokeWeight}
          pointerLength={Math.min(w / 3, h)}
          pointerWidth={Math.min(w / 3, h)}
          lineCap="round"
        />
      )}
    </Group>
  );
}
