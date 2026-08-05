"use client";

import { useEffect } from "react";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { useGalleryDrawer as useDrawerCtx } from "./gallery-drawer-context";
import { useGalleryPaneDrop, type GalleryPaneDropHandlers } from "@/hooks/use-gallery-pane-drop";
import { GalleryDrawer } from "./gallery-drawer/gallery-drawer";

export function GalleryDrawerIntegration({
  canvasId,
  clientId,
  initialDriveRootFolder,
  paneDropRef,
}: {
  canvasId: string;
  clientId: string;
  initialDriveRootFolder: { id: string; name: string } | null;
  /**
   * Canvas's <ReactFlow> lives outside this component's own returned tree (it's
   * a sibling, not a wrapper), so pane-drop handlers can't be attached via JSX
   * here — they're computed in this component (which sits inside ReactFlowProvider
   * and can call useReactFlow) and handed to Canvas through this ref, which Canvas
   * wires directly onto <ReactFlow>'s onDragOver/onDrop.
   */
  paneDropRef: React.MutableRefObject<GalleryPaneDropHandlers>;
}) {
  const drawer = useDrawerCtx();
  const storeApi = useCanvasStoreApi();
  const paneDrop = useGalleryPaneDrop();

  useEffect(() => {
    paneDropRef.current = paneDrop;
  }, [paneDropRef, paneDrop]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "g" && e.key !== "G") return;
      // Stand down while a node focus view is open — it owns the keyboard.
      if (storeApi.getState().openFocusViewIds.length > 0) return;

      // Ctrl/Cmd+G opens the gallery from anywhere — even while typing.
      if (e.ctrlKey || e.metaKey) {
        if (e.altKey || e.shiftKey) return;
        e.preventDefault();
        drawer.openDrawer();
        return;
      }

      // Bare "g" toggles, but not while Alt is held or a field is focused.
      if (e.altKey) return;
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
  }, [drawer, storeApi]);

  return (
    <GalleryDrawer
      canvasId={canvasId}
      clientId={clientId}
      initialDriveRootFolder={initialDriveRootFolder}
    />
  );
}
