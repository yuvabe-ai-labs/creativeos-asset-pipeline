"use client";

import { useEffect, useRef } from "react";
import { useNodeVersions } from "@/hooks/queries/node-versions";
import { useRestoreNodeVersion } from "@/hooks/queries/node-generation";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { durationOfParams } from "@/lib/voice-change/record";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import type { DubbingOutput } from "@/lib/dubbing/types";

export type DubbingVersionSummary = {
  id: string;
  createdAt: string;
  error: string | null;
  dubbing: DubbingOutput | null;
  lipSyncRuns: number;
  creditsCharged: number | null;
  /** What the version was priced on; Lip sync bills this length. */
  paramsUsed?: Record<string, unknown>;
};

/** The Dubbing view's versions (TanStack Query), kept live while open, with the active output
 *  mirrored onto the card (`parsed`) the same way Video Gen's view does. */
export function useDubbingVersions(nodeId: string, open: boolean, onPatch: (p: Record<string, unknown>) => void) {
  const query = useNodeVersions<DubbingVersionSummary>(nodeId, open);
  const restoreMutation = useRestoreNodeVersion(nodeId);
  const onPatchRef = useRef(onPatch);
  useEffect(() => {
    onPatchRef.current = onPatch;
  });

  useNodeVersionUpdates(nodeId, open, () => void query.refetch());

  // The new active version is set after the version row lands, so the live update can arrive
  // first: when a job ends while the view is open, read the list once more (as Video Gen does).
  const { isGenerating } = useGenerationStatus(nodeId);
  const wasGeneratingRef = useRef(false);
  const refetch = query.refetch;
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating && open) void refetch();
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, open, refetch]);

  const versions = query.data?.versions ?? [];
  const activeVersionId = query.data?.activeVersionId ?? null;
  const active = versions.find((v) => v.id === activeVersionId) ?? null;

  // Held while a read is in flight, so a reopen never puts an older dub back on the card.
  const fetching = query.isFetching;
  const activeDubbing = active?.dubbing ?? null;
  useEffect(() => {
    if (!open || fetching || !activeDubbing) return;
    onPatchRef.current({ parsed: activeDubbing });
  }, [open, fetching, activeDubbing]);

  return {
    versions,
    activeVersionId,
    active,
    activeSeconds: durationOfParams(active?.paramsUsed ?? {}),
    loading: query.isPending,
    restore: async (id: string) => { await restoreMutation.mutateAsync(id); },
    restoring: restoreMutation.isPending,
  };
}
