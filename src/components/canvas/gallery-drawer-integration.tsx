"use client";

import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { useGalleryDrawer as useDrawerCtx } from "./gallery-drawer-context";
import { useGalleryDrawer as useGalleryCommit } from "@/hooks/use-gallery-drawer";
import { GalleryDrawer, GALLERY_DRAG_MIME } from "./gallery-drawer/gallery-drawer";
import type { GalleryImage } from "./gallery-drawer/types";

export function GalleryDrawerIntegration({
  canvasId,
  clientId,
  initialDriveRootFolder,
}: {
  canvasId: string;
  clientId: string;
  initialDriveRootFolder: { id: string; name: string } | null;
}) {
  const drawer = useDrawerCtx();
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();
  const storeApi = useCanvasStoreApi();

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

  useEffect(() => {
    const paneEl = document.querySelector<HTMLDivElement>(".react-flow");
    if (!paneEl) return;

    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes(GALLERY_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }

    function onDrop(e: DragEvent) {
      if ((e as DragEvent & { __galleryHandled?: boolean }).__galleryHandled) return;
      const raw = e.dataTransfer?.getData(GALLERY_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      try {
        const parsed = JSON.parse(raw) as { images: GalleryImage[] };
        const position = reactFlow.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        handleAdd(parsed.images, { position, applyOffset: false });
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

  return (
    <GalleryDrawer
      canvasId={canvasId}
      clientId={clientId}
      initialDriveRootFolder={initialDriveRootFolder}
    />
  );
}
