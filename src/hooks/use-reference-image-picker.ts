"use client";

import { useState, useCallback } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { fileNodeService } from "@/services/file-node.service";
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
  const [spawnPosition, setSpawnPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [connectToNodeId, setConnectToNodeId] = useState<string | undefined>(
    undefined,
  );
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const connectNodes = useCanvasStore((s) => s.connectNodes);

  const openPicker = useCallback(
    ({ position, connectToNodeId: targetId }: OpenPickerOptions) => {
      setSpawnPosition(position);
      setConnectToNodeId(targetId);
      setOpen(true);
    },
    [],
  );

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

        if (image.source === "drive") {
          spawnDriveFileNode({
            nodeId,
            image,
            updateNodeData,
          });
        } else {
          updateNodeData(nodeId, {
            fileKind: "image",
            fileUrl: image.imageUrl,
            filename: image.filename,
            meta: { sourceGenerationId: image.generationId },
          });
        }

        if (connectToNodeId) {
          connectNodes(nodeId, connectToNodeId);
        }
      });

      setOpen(false);
    },
    [spawnPosition, connectToNodeId, addNode, updateNodeData, connectNodes],
  );

  return { open, setOpen, openPicker, handleAdd };
}

/** Drive picks are uploaded to GCS via /api/nodes/[id]/file/drive. The node
 *  shows a loading state until the permanent GCS URL is ready. */
function spawnDriveFileNode({
  nodeId,
  image,
  updateNodeData,
}: {
  nodeId: string;
  image: Extract<SelectedImage, { source: "drive" }>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
}) {
  updateNodeData(nodeId, {
    fileKind: "image",
    filename: image.filename,
    driveFileId: image.driveFileId,
    driveMimeType: image.driveMimeType,
    driveFileName: image.filename,
    uploading: true,
  });

  void fileNodeService
    .pickFromDrive(nodeId, {
      driveFileId: image.driveFileId,
      driveFileName: image.filename,
      driveMimeType: image.driveMimeType,
    })
    .then((result) => {
      updateNodeData(nodeId, {
        filename: result.filename,
        fileExt: result.fileExt,
        fileKind: result.fileKind,
        fileUrl: result.fileUrl,
        fileSizeBytes: result.fileSizeBytes,
        driveFileId: result.driveFileId,
        driveFileName: result.driveFileName,
        driveMimeType: result.driveMimeType,
        uploading: false,
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Import failed";
      updateNodeData(nodeId, {
        uploading: false,
        uploadError: message,
      });
    });
}
