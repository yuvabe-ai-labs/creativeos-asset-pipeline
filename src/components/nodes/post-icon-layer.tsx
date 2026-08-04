// src/components/nodes/post-icon-layer.tsx
"use client";

import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { IconLayer } from "@/lib/post/types";
import { layerToKonvaProps } from "@/lib/post/layer-konva-props";
import { resolveIconSource } from "@/lib/post/icons";
import { proxyImageSrc } from "@/lib/post/proxy-image-src";

type Props = {
  layer: IconLayer;
  containerW: number;
  containerH: number;
  nodeRef: (node: Konva.Image | null) => void;
  nodeProps: Konva.NodeConfig;
};

function pascalCase(name: string): string {
  return name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

// Konva only draws Konva-native shapes (Rect/Text/Image/...), never a React component —
// so every icon source rasterizes to an SVG data URL and loads as a Konva Image via
// use-image, uniformly across all three IconSource kinds. Trades a little vector
// crispness for one simple, uniform code path instead of three different SVG-primitive
// extraction strategies per source.
function useIconDataUrl(layer: IconLayer): string {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    const resolved = resolveIconSource(layer.src);
    let svg = "";
    if (resolved.kind === "lucide") {
      const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[pascalCase(resolved.value)];
      if (Icon) {
        svg = renderToStaticMarkup(
          <Icon color={layer.color ?? "#1e1e1e"} strokeWidth={1.5} width={64} height={64} />,
        );
      }
    } else if (resolved.kind === "simple") {
      const color = layer.color ?? `#${resolved.value.hex}`;
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><path d="${resolved.value.path}" fill="${color}"/></svg>`;
    }
    setDataUrl(svg ? `data:image/svg+xml;base64,${btoa(svg)}` : "");
  }, [layer.src, layer.color]);
  return dataUrl;
}

export function PostIconLayer({ layer, containerW, containerH, nodeRef, nodeProps }: Props) {
  const resolved = resolveIconSource(layer.src);
  const synthesizedUrl = useIconDataUrl(layer);
  const src = resolved.kind === "url" ? proxyImageSrc(resolved.value) : synthesizedUrl;
  const [image] = useImage(src, "anonymous");
  const geo = layerToKonvaProps(layer, containerW, containerH);
  if (!image) return null;
  return <KonvaImage ref={nodeRef} image={image} {...geo} {...nodeProps} />;
}
