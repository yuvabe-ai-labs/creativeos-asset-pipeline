// src/components/nodes/post-text-layer.tsx
"use client";

import { Text } from "react-konva";
import type Konva from "konva";
import type { TextLayer } from "@/lib/post/types";
import { layerToKonvaProps, textLayerFontProps } from "@/lib/post/layer-konva-props";
import { resolveFontKey, type FontKey } from "@/lib/post/fonts";
import { FONT_CSS_FAMILY } from "./post-fonts";

type Props = {
  layer: TextLayer;
  containerW: number;
  containerH: number;
  nodeRef: (node: Konva.Text | null) => void;
  nodeProps: Konva.NodeConfig;
  // Double-click enters inline-edit mode — handled by the parent stage (an HTML
  // textarea overlaid on top; Konva itself can't host an editable text input), not
  // here, so this component stays a pure "resting state" renderer (same guarantee
  // post-layer-render.tsx documents for every layer kind).
  onDblClick: () => void;
};

export function PostTextLayer({
  layer, containerW, containerH, nodeRef, nodeProps, onDblClick,
}: Props) {
  const geo = layerToKonvaProps(layer, containerW, containerH);
  const fontProps = textLayerFontProps(layer, containerW, containerH);
  const fontKey = resolveFontKey(layer.fontFamily as FontKey, layer.text);
  return (
    <Text
      ref={nodeRef}
      {...geo}
      {...fontProps}
      fontFamily={FONT_CSS_FAMILY[fontKey]}
      text={layer.text}
      wrap="word"
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      {...nodeProps}
    />
  );
}
