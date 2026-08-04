// src/components/nodes/post-layer-render.tsx
"use client";

import type Konva from "konva";
import type { KonvaNodeEvents } from "react-konva";
import type { PostLayer } from "@/lib/post/types";
import { PostTextLayer } from "./post-text-layer";
import { PostShapeLayer } from "./post-shape-layer";
import { PostImageLayer } from "./post-image-layer";
import { PostIconLayer } from "./post-icon-layer";
import { PostGroupLayer } from "./post-group-layer";

type Props = {
  layer: PostLayer;
  containerW: number;
  containerH: number;
  // Full top-level layer list — only actually needed to resolve a GroupLayer's children
  // (post-group-layer.tsx), but threaded through every layer kind uniformly since this
  // dispatcher recurses into itself for nested group children (a group's child can itself
  // be a group). The only caller, post-stage.tsx, already has this list as its own `layers`
  // prop (Task 8 wires it through).
  allLayers: PostLayer[];
  isSelected: boolean;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  nodeRef: (node: Konva.Node | null) => void;
  // Konva's onClick/onTap hand the underlying event through as their first argument at
  // runtime regardless of this type — widened so callers (post-stage.tsx) can inspect
  // evt.evt.shiftKey for shift-click multi-select. The dispatcher below still just forwards
  // the whole handler (onClick: onSelect / onTap: onSelect), so this is a type-only change.
  onSelect: (evt?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Node) => void;
  onDblClickText: () => void;
};

// THE dispatcher every layer kind renders through — both the editor stage (post-stage.tsx)
// and the export (the SAME Stage instance's toDataURL/toBlob) share it, so there is no
// second render path to drift out of sync with the first.
export function PostLayerRender({
  layer, containerW, containerH, allLayers, isSelected, resolveNodeImageUrl, nodeRef, onSelect,
  onDragEnd, onDblClickText,
}: Props) {
  const nodeProps: Konva.NodeConfig & KonvaNodeEvents = {
    draggable: isSelected && !layer.locked,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e) => onDragEnd(e.target),
  };

  if (layer.kind === "text") {
    return (
      <PostTextLayer
        layer={layer} containerW={containerW} containerH={containerH}
        nodeRef={nodeRef as (n: Konva.Text | null) => void} nodeProps={nodeProps}
        onDblClick={onDblClickText}
      />
    );
  }
  if (layer.kind === "shape") {
    return (
      <PostShapeLayer
        layer={layer} containerW={containerW} containerH={containerH}
        nodeRef={nodeRef as (n: Konva.Rect | null) => void} nodeProps={nodeProps}
      />
    );
  }
  if (layer.kind === "image") {
    const rawUrl = layer.src.kind === "node" ? resolveNodeImageUrl(layer.src.nodeId) : layer.src.url;
    return (
      <PostImageLayer
        layer={layer} containerW={containerW} containerH={containerH} rawUrl={rawUrl}
        nodeRef={nodeRef as (n: Konva.Image | null) => void} nodeProps={nodeProps}
      />
    );
  }
  if (layer.kind === "group") {
    return (
      <PostGroupLayer
        layer={layer} containerW={containerW} containerH={containerH} allLayers={allLayers}
        resolveNodeImageUrl={resolveNodeImageUrl} nodeRef={nodeRef} nodeProps={nodeProps}
      />
    );
  }
  return (
    <PostIconLayer
      layer={layer} containerW={containerW} containerH={containerH}
      nodeRef={nodeRef as (n: Konva.Image | null) => void} nodeProps={nodeProps}
    />
  );
}
