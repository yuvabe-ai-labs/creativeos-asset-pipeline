"use client";

import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { GenerationLock } from "@/lib/editor/types";

/** D390 — why this node can't generate (it feeds the Editor), or null. O(1): reads the index. */
export function useGenerationLock(nodeId: string): GenerationLock | null {
  return useCanvasStore((s) => s.generationLocks[nodeId] ?? null);
}
