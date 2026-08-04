// src/components/nodes/post-image-layer.tsx
"use client";

import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { ImageLayer } from "@/lib/post/types";
import { layerToKonvaProps } from "@/lib/post/layer-konva-props";
import { proxyImageSrc } from "@/lib/post/proxy-image-src";

type Props = {
  layer: ImageLayer;
  containerW: number;
  containerH: number;
  // Resolved by post-layer-render.tsx from the layer's ImageSource (a `{kind:"node"}`
  // source needs the caller's connected-node lookup; `{kind:"url"}` is already a URL).
  rawUrl: string | undefined;
  nodeRef: (node: Konva.Image | null) => void;
  nodeProps: Konva.NodeConfig;
};

// Renders nothing (an empty gap) while the image loads or when the source has no URL
// yet (e.g. a `{kind:"node"}` source whose connected node hasn't generated an output).
export function PostImageLayer({ layer, containerW, containerH, rawUrl, nodeRef, nodeProps }: Props) {
  const [image] = useImage(rawUrl ? proxyImageSrc(rawUrl) : "", "anonymous");
  const geo = layerToKonvaProps(layer, containerW, containerH);
  if (!image) return null;
  return <KonvaImage ref={nodeRef} image={image} {...geo} cornerRadius={layer.radius} {...nodeProps} />;
}
