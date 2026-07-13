"use client";

import { useState, useCallback } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { SelectedImage } from "@/components/canvas/reference-image-picker-dialog";

const COLS = 3;
const GAP_X = 220;
const GAP_Y = 260;
const OFFSET_X = 280;

export function useReferenceImagePicker() {
  const [open, setOpen] = useState(false);
  const [spawnPosition, setSpawnPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const openPicker = useCallback((nodePosition: { x: number; y: number }) => {
    setSpawnPosition(nodePosition);
    setOpen(true);
  }, []);

  const handleAdd = useCallback(
    (images: SelectedImage[]) => {
      const base = { x: spawnPosition.x + OFFSET_X, y: spawnPosition.y };

      images.forEach((image, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const position = {
          x: base.x + col * GAP_X,
          y: base.y + row * GAP_Y,
        };

        const nodeId = crypto.randomUUID();
        addNode("file", position, nodeId);

        const nodeData: Record<string, unknown> = {
          fileKind: "image",
          fileUrl: image.imageUrl,
          filename: image.filename,
        };

        if (image.source === "drive") {
          nodeData.driveFileId = image.driveFileId;
          nodeData.driveMimeType = image.driveMimeType;
          nodeData.driveFileName = image.filename;
        } else {
          nodeData.meta = { sourceGenerationId: image.generationId };
        }

        updateNodeData(nodeId, nodeData);
      });

      setOpen(false);
    },
    [spawnPosition, addNode, updateNodeData]
  );

  return { open, setOpen, openPicker, handleAdd };
}
