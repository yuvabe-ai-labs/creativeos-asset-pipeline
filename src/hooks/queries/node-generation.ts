"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nodeGenerationService } from "@/services/node-generation.service";
import { ApiError } from "@/services/read-json";
import { nodeVersionKeys } from "@/hooks/queries/node-versions";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { DubLanguage, DubPace, DubStyle, DubVoiceChoice } from "@/lib/dubbing/types";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

// D366 — starting a background generation and restoring a version, through TanStack Query
// (CLAUDE.md, "Data fetching"). Starting does not create a version: that happens when the job
// reports back, and the versions cache hears of it through the live channel. What a start changes
// on the client is the node's generation status, which these mutations set on success.

/** The message to show for a failed start: the credit limit by name, else the server's words. */
export function startErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.status === 402) return CREDIT_LIMIT_TOAST_MESSAGE;
  return e instanceof Error && e.message ? e.message : fallback;
}

export function useStartImageGeneration(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => nodeGenerationService.startImage(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "image", started.generationId),
  });
}

export function useStartCompositeGeneration(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => nodeGenerationService.startComposite(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "image", started.generationId),
  });
}

export function useStartDub(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: { language: DubLanguage; style: DubStyle; voice: DubVoiceChoice; pace: DubPace }) => nodeGenerationService.startDub(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "dub", started.generationId),
  });
}

export function useStartLipSync(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: { versionId: string }) => nodeGenerationService.startLipSync(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "lipsync", started.generationId),
  });
}

/** Restore moves the node's active version, so the cached list is re-read. */
export function useRestoreNodeVersion(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => nodeGenerationService.restoreVersion(nodeId, versionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nodeVersionKeys.list(nodeId), exact: true }),
  });
}
