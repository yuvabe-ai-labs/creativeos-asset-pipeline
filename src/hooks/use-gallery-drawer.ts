"use client";

import { useCallback } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { fileNodeService } from "@/services/file-node.service";
import type { GalleryImage } from "@/components/canvas/gallery-drawer/types";

const COLS = 3;
const GAP_X = 220;
const GAP_Y = 260;
const OFFSET_X = 280;

function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export function useGalleryDrawer() {
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const connectNodes = useCanvasStore((s) => s.connectNodes);
  const flushAutosave = useFlushAutosave();

  const handleAdd = useCallback(
    (
      images: GalleryImage[],
      opts: { position: { x: number; y: number }; connectToNodeId?: string; applyOffset?: boolean },
    ) => {
      const offset = opts.applyOffset !== false ? OFFSET_X : 0;
      const base = { x: opts.position.x + offset, y: opts.position.y };
      const drivePicks: { nodeId: string; image: GalleryImage }[] = [];

      images.forEach((image, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const position = { x: base.x + col * GAP_X, y: base.y + row * GAP_Y };

        const nodeId = crypto.randomUUID();
        addNode("file", position, nodeId);

        const title = titleFromFilename(image.filename);

        if (image.source === "drive" && image.driveMimeType) {
          updateNodeData(nodeId, {
            title,
            fileKind: "image",
            filename: image.filename,
            driveFileId: image.id,
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

        if (opts.connectToNodeId) {
          connectNodes(nodeId, opts.connectToNodeId);
        }
      });

      if (drivePicks.length > 0) {
        void (async () => {
          try {
            await flushAutosave();
          } catch (err) {
            console.error("[gallery] autosave flush failed:", err);
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
    [addNode, updateNodeData, connectNodes, flushAutosave],
  );

  return { handleAdd };
}

async function importDriveFile({
  nodeId,
  image,
  updateNodeData,
}: {
  nodeId: string;
  image: GalleryImage;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
}) {
  if (image.source !== "drive" || !image.driveMimeType) return;
  const BACKOFF_MS = [400, 800, 1600];
  try {
    let result: Awaited<ReturnType<typeof fileNodeService.pickFromDrive>>;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        result = await fileNodeService.pickFromDrive(nodeId, {
          driveFileId: image.id,
          driveFileName: image.filename,
          driveMimeType: image.driveMimeType,
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        if (!message.includes("not found") || attempt === BACKOFF_MS.length) throw err;
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
    updateNodeData(nodeId, { uploading: false, uploadError: message });
  }
}
