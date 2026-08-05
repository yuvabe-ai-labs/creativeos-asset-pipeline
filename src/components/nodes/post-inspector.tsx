"use client";

import type { ReactNode } from "react";
import type { PostLayer } from "@/lib/post/types";
import { PostInspectorText } from "./post-inspector-text";
import { PostInspectorShape } from "./post-inspector-shape";
import { PostInspectorImage } from "./post-inspector-image";
import { PostInspectorIcon } from "./post-inspector-icon";
import { PostInspectorCommon } from "./post-inspector-common";

type Props = {
  layer: PostLayer | null;
  // The full current selection count — drives the 0/1/2+ states independently of `layer`
  // (which is only ever populated for exactly one selected layer; see post-focus-view.tsx).
  // A heterogeneous multi-select doesn't try to merge N different property sets into one
  // form (post-editor-ux-v2-design.md §6) — the toolbar/context menu already cover the
  // multi-select-safe actions (align, group, lock, delete).
  selectedCount: number;
  onChange: (patch: Partial<PostLayer>) => void;
  /**
   * Live, uncommitted update for continuous gestures (dragging a slider). Without this a
   * slider would land one undo entry per step, so undoing a single drag would take dozens
   * of presses. Controls that fire continuously call this while dragging and `onChange`
   * once at the end; discrete controls (swatches, toggles) only ever call `onChange`.
   * Falls back to `onChange` when a caller doesn't supply it.
   */
  onPreview?: (patch: Partial<PostLayer>) => void;
  naturalSize?: { width: number; height: number };
  /** The artboard's on-screen size — the rotation control turns about the layer's centre,
   *  which is only expressible in real px (x/w scale on width, y/h on height). */
  containerW: number;
  containerH: number;
};

/** Plain-English name for a layer kind — internal tokens never reach the user (D122). */
function kindLabel(layer: PostLayer): string {
  switch (layer.kind) {
    case "text": return "Text";
    case "shape": return "Shape";
    case "image": return "Image";
    case "icon": return "Icon";
    case "group": return "Group";
  }
}

/**
 * One shell for every state — header + body never restructure across selection changes, so
 * switching from a text layer to a shape doesn't read as a different screen (D119).
 */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-eyebrow !text-[0.6rem] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function PostInspector({
  layer, selectedCount, onChange, onPreview, naturalSize, containerW, containerH,
}: Props) {
  const preview = onPreview ?? onChange;
  if (selectedCount > 1) {
    return (
      <Shell title="Selection">
        <p className="text-xs text-muted-foreground">
          {selectedCount} layers selected. Right-click the canvas to align, group,
          lock, or delete.
        </p>
      </Shell>
    );
  }
  if (!layer) {
    return (
      <Shell title="Inspector">
        <p className="text-xs text-muted-foreground">Select a layer to edit its properties.</p>
      </Shell>
    );
  }
  return (
    <Shell title={kindLabel(layer)}>
      {layer.kind === "text" && (
        <PostInspectorText layer={layer} onChange={onChange} onPreview={preview} />
      )}
      {layer.kind === "shape" && (
        <PostInspectorShape layer={layer} onChange={onChange} onPreview={preview} />
      )}
      {layer.kind === "image" && (
        <PostInspectorImage
          layer={layer} onChange={onChange} onPreview={preview} naturalSize={naturalSize}
        />
      )}
      {layer.kind === "icon" && <PostInspectorIcon layer={layer} onChange={onChange} onPreview={preview} />}
      {layer.kind === "group" && (
        <p className="text-xs text-muted-foreground">
          Group of {layer.childIds.length} layers. Right-click the canvas to
          ungroup, align, lock, or delete.
        </p>
      )}
      {/* Opacity and rotation are on LayerBase, so they belong to every kind — including a
          group, where they apply to the whole group at once. */}
      <PostInspectorCommon
        layer={layer} onChange={onChange} onPreview={preview}
        containerW={containerW} containerH={containerH}
      />
    </Shell>
  );
}
