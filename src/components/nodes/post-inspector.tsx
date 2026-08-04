"use client";

import type { PostLayer } from "@/lib/post/types";
import { PostInspectorText } from "./post-inspector-text";
import { PostInspectorShape } from "./post-inspector-shape";
import { PostInspectorImage } from "./post-inspector-image";
import { PostInspectorIcon } from "./post-inspector-icon";

type Props = {
  layer: PostLayer | null;
  // The full current selection count — drives the 0/1/2+ states independently of `layer`
  // (which is only ever populated for exactly one selected layer; see post-focus-view.tsx).
  // A heterogeneous multi-select doesn't try to merge N different property sets into one
  // form (post-editor-ux-v2-design.md §6) — the toolbar/context menu already cover the
  // multi-select-safe actions (align, group, lock, delete).
  selectedCount: number;
  onChange: (patch: Partial<PostLayer>) => void;
  naturalSize?: { width: number; height: number };
};

export function PostInspector({ layer, selectedCount, onChange, naturalSize }: Props) {
  if (selectedCount === 0 || !layer) {
    return <p className="p-3 text-sm text-muted-foreground">Select a layer to edit its properties.</p>;
  }
  if (selectedCount > 1) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {selectedCount} layers selected. Use the toolbar or right-click menu to align, group,
        lock, or delete.
      </p>
    );
  }
  if (layer.kind === "text") return <PostInspectorText layer={layer} onChange={onChange} />;
  if (layer.kind === "shape") return <PostInspectorShape layer={layer} onChange={onChange} />;
  if (layer.kind === "image") return <PostInspectorImage layer={layer} onChange={onChange} naturalSize={naturalSize} />;
  if (layer.kind === "icon") return <PostInspectorIcon layer={layer} onChange={onChange} />;
  // GroupLayer: no per-kind style fields of its own — a simple info panel, same spirit as
  // the multi-select placeholder above. Ungroup/align are already available via the
  // toolbar/context menu/shortcuts, so this doesn't duplicate them.
  return (
    <p className="p-3 text-sm text-muted-foreground">
      Group of {layer.childIds.length} layers. Use the toolbar or right-click menu to ungroup,
      align, lock, or delete.
    </p>
  );
}
