"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { imageAnalysisService, type ImageAnalysisState } from "@/services/image-analysis.service";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";

// D312 — the Brand KB's image analysis through TanStack Query (D300). Keys are built here only.
export const imageAnalysisKeys = {
  status: (clientId: string) => ["image-analysis", clientId, "status"] as const,
};

/** While a run is going, check often; otherwise now and then, since uploads and imports elsewhere
 *  start runs too and the review screen should pick their results up. */
const LIVE_POLL_MS = 4000;
const IDLE_POLL_MS = 30_000;

export const isAnalysisLive = (s: ImageAnalysisState | undefined) =>
  Boolean(s?.job && JOB_LIVE_STATUSES.has(s.job.status));

export function useImageAnalysisStatus(clientId: string) {
  return useQuery({
    queryKey: imageAnalysisKeys.status(clientId),
    queryFn: () => imageAnalysisService.status(clientId),
    enabled: Boolean(clientId),
    refetchInterval: (q) => (isAnalysisLive(q.state.data) ? LIVE_POLL_MS : IDLE_POLL_MS),
  });
}

export function useStartImageAnalysis(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => imageAnalysisService.start(clientId),
    onSuccess: (state: ImageAnalysisState) => queryClient.setQueryData(imageAnalysisKeys.status(clientId), state),
  });
}
