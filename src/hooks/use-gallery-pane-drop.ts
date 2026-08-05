"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGalleryDrawer as useGalleryCommit } from "./use-gallery-drawer";
import { GALLERY_DRAG_MIME } from "@/components/canvas/gallery-drawer/gallery-drawer";
import type { GalleryImage } from "@/components/canvas/gallery-drawer/types";

export interface GalleryPaneDropHandlers {
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/**
 * Pane-level drop target for gallery drag payloads. Attach the returned handlers
 * to the `<ReactFlow>` component's onDragOver/onDrop props (they forward to the
 * wrapper div). Must be React synthetic handlers, not raw addEventListener —
 * node-level drops (useGalleryNodeDrop) call stopPropagation on the synthetic
 * event to keep this pane handler from also firing on the same drop, and that
 * only works within React's own event dispatch, not against a native listener.
 */
export function useGalleryPaneDrop(): GalleryPaneDropHandlers {
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(GALLERY_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(GALLERY_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      try {
        const parsed = JSON.parse(raw) as { images: GalleryImage[] };
        const position = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        handleAdd(parsed.images, { position, applyOffset: false });
      } catch (err) {
        console.warn("[gallery] pane drop payload malformed:", err);
      }
    },
    [handleAdd, reactFlow],
  );

  return { onDragOver, onDrop };
}
