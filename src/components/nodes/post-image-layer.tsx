// src/components/nodes/post-image-layer.tsx
"use client";

import { useEffect } from "react";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { ImageLayer } from "@/lib/post/types";
import { layerToKonvaProps } from "@/lib/post/layer-konva-props";
import { proxyImageSrc } from "@/lib/post/proxy-image-src";
import { computeCoverCrop, computeContainRect } from "@/lib/post/image-fit";

type Props = {
  layer: ImageLayer;
  containerW: number;
  containerH: number;
  // Resolved by post-layer-render.tsx from the layer's ImageSource (a `{kind:"node"}`
  // source needs the caller's connected-node lookup; `{kind:"url"}` is already a URL).
  rawUrl: string | undefined;
  nodeRef: (node: Konva.Image | null) => void;
  nodeProps: Konva.NodeConfig;
  // Reports the bitmap's natural size once it finishes loading, so a SEPARATE component
  // (the inspector, which has no direct access to this file's useImage result) can offer
  // a "reset to natural proportions" action. Fired from a useEffect keyed on the loaded
  // `image` object, so it runs once per successful load, not on every render.
  onImageLoaded: (layerId: string, naturalW: number, naturalH: number) => void;
};

// Draws nothing (an empty gap) while the image loads or when the source has no URL yet
// (e.g. a `{kind:"node"}` source whose connected node hasn't generated an output) — but
// keeps the Konva node itself MOUNTED (image={undefined} rather than returning null), so
// its ref never fires with null just because `use-image` resets to undefined mid-reload.
// That keeps nodeRefs.current/the Transformer attached across a source-URL change; the
// ref only goes null when this layer is actually removed upstream in post-layer-render.tsx.
//
// Known nuance for fit:"contain": the Konva node IS the letterboxed rect (no wrapping
// Group — adding one would mean re-wiring the nodeRef/Transformer plumbing this file's
// comment above exists to protect), so the Transformer hugs the visible image rather
// than the layer's declared box, and the first drag/resize commits that fitted rect back
// as the layer's geometry. It converges after one gesture (box ratio then matches the
// image) and never distorts; a Group-based version is the V2 fix.
export function PostImageLayer({
  layer, containerW, containerH, rawUrl, nodeRef, nodeProps, onImageLoaded,
}: Props) {
  const [image] = useImage(rawUrl ? proxyImageSrc(rawUrl) : "", "anonymous");

  useEffect(() => {
    if (!image) return;
    const naturalW = image.naturalWidth || image.width;
    const naturalH = image.naturalHeight || image.height;
    if (naturalW > 0 && naturalH > 0) onImageLoaded(layer.id, naturalW, naturalH);
  }, [image, layer.id, onImageLoaded]);

  const geo = layerToKonvaProps(layer, containerW, containerH);
  return (
    <KonvaImage
      ref={nodeRef}
      image={image}
      {...geo}
      {...imageFitProps(layer.fit, image, geo)}
      cornerRadius={layer.radius}
      {...nodeProps}
    />
  );
}

// Konva's <Image> stretches the bitmap to width/height, so `fit` has to be applied by
// hand — as a source CROP for "cover" and as an adjusted destination rect for "contain".
// Returns nothing until the bitmap has loaded (natural size unknown -> nothing to fit).
function imageFitProps(
  fit: ImageLayer["fit"],
  image: HTMLImageElement | undefined,
  geo: { x: number; y: number; width: number; height: number; rotation: number },
): Konva.NodeConfig {
  const imgW = image?.naturalWidth || image?.width || 0;
  const imgH = image?.naturalHeight || image?.height || 0;
  if (imgW <= 0 || imgH <= 0 || geo.width <= 0 || geo.height <= 0) return {};

  if (fit === "contain") {
    // The whole image, centred, letterboxed inside the box. The offsets are in the
    // layer's own (unrotated) frame, so rotate them before adding to the stage-space
    // x/y — Konva rotates a node about its own x/y position.
    const rect = computeContainRect(imgW, imgH, geo.width, geo.height);
    const rad = ((geo.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: geo.x + rect.x * cos - rect.y * sin,
      y: geo.y + rect.x * sin + rect.y * cos,
      width: rect.width,
      height: rect.height,
    };
  }
  return { crop: computeCoverCrop(imgW, imgH, geo.width, geo.height) };
}
