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
  // True only for the single text layer currently open in the inline-edit Textarea overlay
  // (post-stage.tsx) — hides the real Konva node (opacity 0, not visible: false, so
  // getClientRect() used to position the overlay stays correct) so the overlay's live-typed
  // content is the only visible representation of the text while editing. Defaults to false
  // for every layer kind except the one being edited.
  isBeingEdited?: boolean;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  nodeRef: (node: Konva.Node | null) => void;
  // Konva's onClick/onTap hand the underlying event through as their first argument at
  // runtime regardless of this type — widened so callers (post-stage.tsx) can inspect
  // evt.evt.shiftKey for shift-click multi-select. The dispatcher below still just forwards
  // the whole handler (onClick: onSelect / onTap: onSelect), so this is a type-only change.
  onSelect: (evt?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (node: Konva.Node) => void;
  onDblClickText: () => void;
  // Only the "image" branch below forwards this to PostImageLayer — every other layer
  // kind receives it but ignores it, same as onDblClickText above.
  onImageLoaded: (layerId: string, naturalW: number, naturalH: number) => void;
  // The three below exist only for the group branch. A grouped text layer — every template's
  // CTA label is one — was otherwise uneditable: not registered in nodeRefs, so the inline
  // editor had nothing to position against, and handed a no-op dbl-click handler, so it could
  // never be opened. Changing a button's wording meant discovering ungroup, which nothing in
  // the UI surfaces.
  registerRef?: (id: string, node: Konva.Node | null) => void;
  onDblClickTextFor?: (id: string) => void;
  /** Id of the layer currently open in the inline editor, so a grouped child can hide itself. */
  editingLayerId?: string | null;
};

// THE dispatcher every layer kind renders through — both the editor stage (post-stage.tsx)
// and the export (the SAME Stage instance's toDataURL/toBlob) share it, so there is no
// second render path to drift out of sync with the first.
export function PostLayerRender({
  layer, containerW, containerH, allLayers, isSelected, isBeingEdited = false, resolveNodeImageUrl,
  nodeRef, onSelect, onDragEnd, onDblClickText, onImageLoaded,
  registerRef, onDblClickTextFor, editingLayerId,
}: Props) {
  const nodeProps: Konva.NodeConfig & KonvaNodeEvents = {
    draggable: isSelected && !layer.locked,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e) => onDragEnd(e.target),
    // Hide the resting Konva node while its inline-edit Textarea overlay is open, so the
    // overlay's live content isn't ghosted by the last-committed text rendered underneath
    // at the same position (opacity, not visible: false — Konva's getClientRect ignores
    // opacity but some versions skip invisible nodes in bounding-box math, which
    // post-stage.tsx's editingRect calc depends on).
    ...(isBeingEdited ? { opacity: 0 } : {}),
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
        onImageLoaded={onImageLoaded}
      />
    );
  }
  if (layer.kind === "group") {
    return (
      <PostGroupLayer
        layer={layer} containerW={containerW} containerH={containerH} allLayers={allLayers}
        resolveNodeImageUrl={resolveNodeImageUrl} nodeRef={nodeRef} nodeProps={nodeProps}
        registerRef={registerRef}
        onDblClickTextFor={onDblClickTextFor}
        editingLayerId={editingLayerId}
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
