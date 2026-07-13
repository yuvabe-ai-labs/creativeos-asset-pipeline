"use client";

import { useState, useCallback } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { SelectedImage } from "@/components/canvas/reference-image-picker-dialog";

const COLS = 3;
const GAP_X = 220;
const GAP_Y = 260;
const OFFSET_X = 280;

type OpenPickerOptions = {
  position: { x: number; y: number };
  connectToNodeId?: string;
};

export function useReferenceImagePicker() {
  const [open, setOpen] = useState(false);
  const [spawnPosition, setSpawnPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [connectToNodeId, setConnectToNodeId] = useState<string | undefined>(undefined);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const connectNodes = useCanvasStore((s) => s.connectNodes);

  const openPicker = useCallback(({ position, connectToNodeId: targetId }: OpenPickerOptions) => {
    setSpawnPosition(position);
    setConnectToNodeId(targetId);
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

        if (connectToNodeId) {
          connectNodes(nodeId, connectToNodeId);
        }
      });

      setOpen(false);
    },
    [spawnPosition, connectToNodeId, addNode, updateNodeData, connectNodes]
  );

  return { open, setOpen, openPicker, handleAdd };
}
