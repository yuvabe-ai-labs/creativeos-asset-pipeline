// src/hooks/use-post-export.ts
"use client";

import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import type Konva from "konva";
import type { PostFormat } from "@/lib/post/types";
import type { PostNodeData } from "@/lib/canvas-nodes";
import { postNodeService } from "@/services/post-node.service";

type Args = {
  nodeId: string;
  stageRef: React.RefObject<Konva.Stage | null>;
  format: PostFormat;
  title: string;
  onDeselect: () => void; // clears the Transformer so its handles never appear in the export
  onPatch: (patch: Partial<PostNodeData>) => void;
};

export function usePostExport({ nodeId, stageRef, format, title, onDeselect, onPatch }: Args) {
  const [isExporting, setIsExporting] = useState(false);

  const downloadPng = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setIsExporting(true);
    try {
      // flushSync forces the deselect state update AND its effect (which detaches the
      // Transformer and repaints) to finish before toBlob captures pixels — without it,
      // the capture can race ahead of the redraw and still show selection handles.
      flushSync(() => onDeselect());
      // `downscaled` is a property of THIS run, not of the render — keep it out of the
      // patch so it never lands in node data.
      const { downscaled, ...result } = await postNodeService.exportRender(nodeId, stage, format, title);
      onPatch(result);
      if (downscaled) {
        toast.warning("A4 at 300 DPI was over the 10 MB upload limit — exported at 150 DPI instead.");
      }
      const res = await fetch(result.fileUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [nodeId, stageRef, format, title, onDeselect, onPatch]);

  return { downloadPng, isExporting };
}
