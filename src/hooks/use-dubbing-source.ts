"use client";

import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { durationOfParams } from "@/lib/voice-change/record";

export type DubbingSource = { id: string; type: string; data: Record<string, unknown>; url: string | null; seconds: number };

/** D374 — the one Video Gen node wired into a Dubbing node. While `open` is false the selector
 *  returns at once, so a closed view does no scanning as the canvas changes (performance rule 2).
 *  The selector returns the store's own node object, which is stable until that node changes. */
export function useDubbingSource(nodeId: string, open: boolean): DubbingSource | null {
  const node = useCanvasStore((s) => {
    if (!open) return null;
    const edge = s.edges.find((e) => e.target === nodeId);
    return edge ? s.nodes.find((n) => n.id === edge.source && n.type === "video-gen") ?? null : null;
  });
  if (!node) return null;
  const data = node.data as Record<string, unknown>;
  return {
    id: node.id,
    type: "video-gen",
    data,
    url: typeof data.parsed === "string" && data.parsed ? data.parsed : null,
    // Only the estimate: the server re-reads the real length from the version it dubs.
    seconds: durationOfParams((data.params ?? {}) as Record<string, unknown>),
  };
}
