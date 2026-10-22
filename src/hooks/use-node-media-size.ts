"use client";

import { useState } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { mediaSizeToSave, resolveMediaRatio, type MediaSize } from "@/lib/canvas/media-fit";

/**
 * D384 — the aspect ratio a node card lays its media out at. Measured when the media loads and
 * saved on the node once (only when it changed, only by the canvas lock holder), so a reload lays
 * out at the final size. No network call, no effect: the write happens in the load handler.
 */
export function useNodeMediaSize(
  nodeId: string,
  saved: { width?: number; height?: number },
  fallbackRatio: number | null,
): { ratio: number; measured: MediaSize | null; onMeasured: (width: number, height: number) => void } {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const editable = useCanvasEditable();
  const [measured, setMeasured] = useState<MediaSize | null>(null);

  function onMeasured(width: number, height: number) {
    const next = { width, height };
    setMeasured(next);
    const patch = mediaSizeToSave(saved, next, editable);
    if (patch) updateNodeData(nodeId, patch);
  }

  return { ratio: resolveMediaRatio(measured, saved, fallbackRatio), measured, onMeasured };
}
