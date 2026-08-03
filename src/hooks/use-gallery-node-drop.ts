"use client";

import { useCallback } from "react";
import { useGalleryDrawer as useGalleryCommit } from "./use-gallery-drawer";
import { GALLERY_DRAG_MIME } from "@/components/canvas/gallery-drawer/gallery-drawer";
import type { GalleryImage } from "@/components/canvas/gallery-drawer/types";

/**
 * Node-level drop target for gallery drag payloads. Attach the returned handlers
 * to the outer wrapper `<div>` of an eligible node component (prompt, image-gen,
 * video-prompt, video-gen, shot).
 *
 * On drop, spawns file nodes at the target node's position and auto-connects
 * them to the target so the images become reference inputs for that node.
 */
export function useGalleryNodeDrop(
  nodeId: string,
  position: { x: number; y: number },
) {
  const { handleAdd } = useGalleryCommit();

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(GALLERY_DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(GALLERY_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      // Stops the synthetic event so the pane-level onDrop on <ReactFlow> doesn't
      // also fire for this drop (both are React handlers now, so this works).
      e.stopPropagation();
      try {
        const parsed = JSON.parse(raw) as { images: GalleryImage[] };
        handleAdd(parsed.images, { position, connectToNodeId: nodeId, applyOffset: false });
      } catch (err) {
        console.warn("[gallery] node drop payload malformed:", err);
      }
    },
    [handleAdd, nodeId, position],
  );

  return { onDragOver, onDrop };
}
