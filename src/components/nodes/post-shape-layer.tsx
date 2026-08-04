// src/components/nodes/post-shape-layer.tsx
"use client";

import { Rect } from "react-konva";
import type Konva from "konva";
import type { ShapeLayer } from "@/lib/post/types";
import { layerToKonvaProps, shapeLayerFillProps } from "@/lib/post/layer-konva-props";

type Props = {
  layer: ShapeLayer;
  containerW: number;
  containerH: number;
  nodeRef: (node: Konva.Rect | null) => void;
  nodeProps: Konva.NodeConfig;
};

export function PostShapeLayer({ layer, containerW, containerH, nodeRef, nodeProps }: Props) {
  const geo = layerToKonvaProps(layer, containerW, containerH);
  const fillProps = shapeLayerFillProps(layer, geo.width, geo.height);
  return <Rect ref={nodeRef} {...geo} {...fillProps} {...nodeProps} />;
}
