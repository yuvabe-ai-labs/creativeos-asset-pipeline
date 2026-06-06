"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasNodesAction, saveCanvasEdgesAction } from "@/lib/actions/nodes";
import { useCanvasStore } from "./canvas-store-provider";

// Watches nodes and edges; debounces both to a single write 600ms after last change.
export function CanvasAutosave({ canvasId }: { canvasId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    // Skip the initial render — data was just loaded from the DB.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void Promise.all([
        saveCanvasNodesAction(canvasId, nodes.map(flowToPersisted)),
        saveCanvasEdgesAction(canvasId, edges),
      ]).catch(() => {
        // best-effort autosave
      });
    }, 600);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nodes, edges, canvasId]);

  return null;
}
