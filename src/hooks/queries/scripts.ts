"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scriptsService } from "@/services/scripts.service";

// Script copilot spec 1 — the scripts resource, through TanStack Query. Keys are built here only.
export const scriptKeys = {
  all: (clientId: string) => ["scripts", clientId] as const,
  approved: (clientId: string) => [...scriptKeys.all(clientId), "approved"] as const,
};

/** The client's approved scripts: what the canvas gallery's Scripts tab offers (spec 1 §5.1).
 *  Approval happens on another page, so this revalidates whenever the tab mounts. */
export function useApprovedScripts(clientId: string) {
  return useQuery({
    queryKey: scriptKeys.approved(clientId),
    queryFn: () => scriptsService.list(clientId, "approved"),
    enabled: Boolean(clientId),
    staleTime: 0,
  });
}

export function useRefreshScripts(clientId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) });
}
