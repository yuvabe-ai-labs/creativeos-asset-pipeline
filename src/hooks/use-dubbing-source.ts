"use client";

import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useNodeVersions } from "@/hooks/queries/node-versions";
import { durationOfParams } from "@/lib/voice-change/record";

export type DubbingSource = { id: string; type: string; data: Record<string, unknown>; url: string | null; seconds: number; secondsLoading: boolean };

type SourceVersion = { id: string; paramsUsed?: Record<string, unknown> };

/** D374 — the one Video Gen node wired into a Dubbing node. While `open` is false the selector
 *  returns at once, so a closed view does no scanning as the canvas changes (performance rule 2).
 *  The selector returns the store's own node object, which is stable until that node changes. */
export function useDubbingSource(nodeId: string, open: boolean): DubbingSource | null {
  const node = useCanvasStore((s) => {
    if (!open) return null;
    const edge = s.edges.find((e) => e.target === nodeId);
    return edge ? s.nodes.find((n) => n.id === edge.source && n.type === "video-gen") ?? null : null;
  });
  // The server prices the wired node's ACTIVE version (resolveDubSource), so the estimate reads
  // that version's recorded length — not the node's current params, which may have moved on. The
  // list is the shared cache Video Gen's view uses, read only while this view is open.
  const versions = useNodeVersions<SourceVersion>(node?.id ?? "", open && Boolean(node));
  if (!node) return null;
  const activeSource = versions.data?.versions.find((v) => v.id === versions.data?.activeVersionId);
  const data = node.data as Record<string, unknown>;
  return {
    id: node.id,
    type: "video-gen",
    data,
    url: typeof data.parsed === "string" && data.parsed ? data.parsed : null,
    seconds: durationOfParams(activeSource?.paramsUsed ?? {}),
    secondsLoading: versions.isPending,
  };
}
