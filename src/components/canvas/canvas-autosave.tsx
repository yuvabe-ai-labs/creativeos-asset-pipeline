"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasNodesAction } from "@/lib/actions/nodes";
import { useCanvasStore } from "./canvas-store-provider";

// Watches the store's nodes and persists them, debounced. Renders nothing.
// Because we subscribe to `s.nodes`, this runs on every add/drag/edit; the
// debounce means we only write ~600ms after the last change (e.g. drag end).
export function CanvasAutosave({ canvasId }: { canvasId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    // Skip the initial render — those nodes were just loaded from the DB,
    // no need to write them straight back.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveCanvasNodesAction(canvasId, nodes.map(flowToPersisted)).catch(
        () => {
          // best-effort autosave; we can surface a toast later
        },
      );
    }, 600);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nodes, canvasId]);

  return null;
}
