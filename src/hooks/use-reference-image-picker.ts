"use client";

import { useState, useCallback } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { fileNodeService } from "@/services/file-node.service";
import type { SelectedImage } from "@/components/canvas/reference-image-picker-dialog";

/** Strip the extension so the file node's title reads cleanly. */
function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

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
  const flushAutosave = useFlushAutosave();

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

      // First pass: create all nodes locally + seed data (sync).
      const drivePicks: { nodeId: string; image: Extract<SelectedImage, { source: "drive" }> }[] = [];

      images.forEach((image, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const position = {
          x: base.x + col * GAP_X,
          y: base.y + row * GAP_Y,
        };

        const nodeId = crypto.randomUUID();
        addNode("file", position, nodeId);

        const title = titleFromFilename(image.filename);

        if (image.source === "drive") {
          updateNodeData(nodeId, {
            title,
            fileKind: "image",
            filename: image.filename,
            driveFileId: image.driveFileId,
            driveMimeType: image.driveMimeType,
            driveFileName: image.filename,
            uploading: true,
          });
          drivePicks.push({ nodeId, image });
        } else {
          updateNodeData(nodeId, {
            title,
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

      // Second pass: flush pending writes so the node rows exist in the DB,
      // then run Drive imports (each needs its node row to be present in `nodes`).
      if (drivePicks.length > 0) {
        void (async () => {
          try {
            await flushAutosave();
          } catch (err) {
            console.error("[reference-picker] autosave flush failed:", err);
          }
          for (const pick of drivePicks) {
            void importDriveFile({
              nodeId: pick.nodeId,
              image: pick.image,
              updateNodeData,
            });
          }
        })();
      }
    },
    [
      spawnPosition,
      connectToNodeId,
      addNode,
      updateNodeData,
      connectNodes,
      flushAutosave,
    ],
  );

  return { open, setOpen, openPicker, handleAdd };
}

/** Fetches full-res bytes from Drive and uploads to GCS via
 *  /api/nodes/[id]/file/drive. Retries on "Node not found" — the autosave flush
 *  usually persists the row first, but a brief propagation delay is possible. */
async function importDriveFile({
  nodeId,
  image,
  updateNodeData,
}: {
  nodeId: string;
  image: Extract<SelectedImage, { source: "drive" }>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
}) {
  const BACKOFF_MS = [400, 800, 1600];
  try {
    let result: Awaited<ReturnType<typeof fileNodeService.pickFromDrive>>;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        result = await fileNodeService.pickFromDrive(nodeId, {
          driveFileId: image.driveFileId,
          driveFileName: image.filename,
          driveMimeType: image.driveMimeType,
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        const isNotFound = message.includes("not found");
        if (!isNotFound || attempt === BACKOFF_MS.length) throw err;
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
    }
    if (lastErr) throw lastErr;
    updateNodeData(nodeId, {
      filename: result!.filename,
      fileExt: result!.fileExt,
      fileKind: result!.fileKind,
      fileUrl: result!.fileUrl,
      fileSizeBytes: result!.fileSizeBytes,
      driveFileId: result!.driveFileId,
      driveFileName: result!.driveFileName,
      driveMimeType: result!.driveMimeType,
      uploading: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    updateNodeData(nodeId, {
      uploading: false,
      uploadError: message,
    });
  }
}
