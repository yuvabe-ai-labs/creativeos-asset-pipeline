"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGalleryDrawer as useGalleryCommit } from "./use-gallery-drawer";
import { GALLERY_DRAG_MIME } from "@/components/canvas/gallery-drawer/gallery-drawer";
import type { GalleryImage } from "@/components/canvas/gallery-drawer/types";
import { AVATAR_DRAG_MIME, parseAvatarDragPayload } from "@/lib/avatars/canvas";
import { useAddAvatarNode } from "./use-add-avatar-node";
import { SCRIPT_DRAG_MIME } from "@/lib/scripts/constants";
import { parseScriptDragPayload } from "@/lib/scripts/canvas";
import { useAddScriptNode } from "./use-add-script-node";

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
  const addAvatarNode = useAddAvatarNode();
  const addScriptNode = useAddScriptNode();
  const reactFlow = useReactFlow();

  const onDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (!types.includes(GALLERY_DRAG_MIME) && !types.includes(AVATAR_DRAG_MIME) && !types.includes(SCRIPT_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      // Spec 1 §5.2 — an approved script from the gallery's Scripts tab: a parsed Script node.
      const script = parseScriptDragPayload(e.dataTransfer.getData(SCRIPT_DRAG_MIME));
      if (script) {
        e.preventDefault();
        void addScriptNode(script.scriptId, reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        return;
      }
      // D298 — an avatar from the gallery's Avatars tab: a node where it was dropped.
      const avatar = parseAvatarDragPayload(e.dataTransfer.getData(AVATAR_DRAG_MIME));
      if (avatar) {
        e.preventDefault();
        addAvatarNode(avatar.avatarId, {
          position: reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        });
        return;
      }
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
    [handleAdd, addAvatarNode, addScriptNode, reactFlow],
  );

  return { onDragOver, onDrop };
}
