"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { compilePreviewService } from "@/services/compile-preview.service";

// A node's connected inputs as the server resolves them (POST compile-preview), through TanStack
// Query (CLAUDE.md, "Data fetching"). The keys are built here and nowhere else.
export const compilePreviewKeys = {
  all: (nodeId: string) => ["compile-preview", nodeId] as const,
  /** `wiredKey` names the inputs the read must see (e.g. the wired Avatar nodes), so wiring one in
   *  while the view is open reads again rather than showing an answer from before it. */
  detail: (nodeId: string, wiredKey: string) => [...compilePreviewKeys.all(nodeId), wiredKey] as const,
};

/** Read the node's connected inputs once per open. The route walks PERSISTED edges, so autosave is
 *  flushed first; a failed flush still reads (autosave retries on its own, and inputs already
 *  saved must not wait on an unrelated save). Never refetches on focus: one request per open. */
export function useCompilePreview(nodeId: string, wiredKey: string, enabled: boolean) {
  const flushAutosave = useFlushAutosave();
  return useQuery({
    queryKey: compilePreviewKeys.detail(nodeId, wiredKey),
    queryFn: async () => {
      try {
        await flushAutosave();
      } catch (err) {
        console.error("[compile-preview] autosave flush failed:", err);
      }
      return compilePreviewService.get(nodeId);
    },
    enabled,
    // A rewire reads again under a new key; the last answer stays on screen meanwhile, so the
    // inputs already shown do not blink out (isPlaceholderData marks it as the old answer).
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
