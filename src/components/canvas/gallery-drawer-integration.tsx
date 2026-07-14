"use client";

import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGalleryDrawer as useDrawerCtx } from "./gallery-drawer-context";
import { useGalleryDrawer as useGalleryCommit } from "@/hooks/use-gallery-drawer";
import { GalleryDrawer, GALLERY_DRAG_MIME } from "./gallery-drawer/gallery-drawer";
import type { GalleryImage } from "./gallery-drawer/types";

/**
 * Renders the drawer and wires the canvas-level integrations that need to live
 * inside GalleryDrawerProvider + AutosaveFlushProvider:
 *   - Global keyboard shortcut `G` toggles the drawer.
 *   - Canvas pane drop target for gallery drag payloads.
 *   - Mounts the drawer itself.
 *
 * Node-level drops are wired inside individual node components.
 */
export function GalleryDrawerIntegration({ canvasId }: { canvasId: string }) {
  const drawer = useDrawerCtx();
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();

  // Keyboard shortcut: G toggles the drawer. Ignored when a text input is focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      drawer.toggleDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  // Canvas pane drop target: parse gallery payloads and spawn floating file nodes.
  useEffect(() => {
    const paneEl = document.querySelector<HTMLDivElement>(".react-flow");
    if (!paneEl) return;

    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes(GALLERY_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }

    function onDrop(e: DragEvent) {
      const raw = e.dataTransfer?.getData(GALLERY_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      // If a node-level handler already handled the drop, its stopPropagation
      // will have prevented us from seeing it. If we get here, treat as pane drop.
      try {
        const parsed = JSON.parse(raw) as { images: GalleryImage[] };
        const position = reactFlow.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        handleAdd(parsed.images, { position });
      } catch (err) {
        console.warn("[gallery] pane drop payload malformed:", err);
      }
    }

    paneEl.addEventListener("dragover", onDragOver);
    paneEl.addEventListener("drop", onDrop);
    return () => {
      paneEl.removeEventListener("dragover", onDragOver);
      paneEl.removeEventListener("drop", onDrop);
    };
  }, [handleAdd, reactFlow]);

  return <GalleryDrawer canvasId={canvasId} />;
}
