"use client";

import { skipToken, useQuery, type QueryClient } from "@tanstack/react-query";
import { copilotTracesService } from "@/services/copilot-traces.service";

// Copilot turn traces through TanStack Query (D509). Read only while the developer switch is on, and
// never polled: the list is refreshed once after each turn this browser sends.

export const copilotTraceKeys = {
  all: (clientId: string) => ["copilot-traces", clientId] as const,
  list: (clientId: string) => [...copilotTraceKeys.all(clientId), "list"] as const,
  detail: (clientId: string, id: string) => [...copilotTraceKeys.all(clientId), "detail", id] as const,
};

/** The client's recent turns, one line each. Nothing is fetched while `enabled` is false. */
export function useTurnLines(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: copilotTraceKeys.list(clientId),
    queryFn: () => copilotTracesService.lines(clientId),
    enabled,
  });
}

/** One turn's whole trace, fetched when it is opened. A trace never changes, so it is never re-read. */
export function useTurnTrace(clientId: string, id: string | null) {
  return useQuery({
    queryKey: copilotTraceKeys.detail(clientId, id ?? ""),
    queryFn: id ? () => copilotTracesService.trace(clientId, id) : skipToken,
    staleTime: Infinity,
  });
}

/** How long after a turn ends its trace is looked for: the server keeps it only once the answer has
 *  gone, so a read at the very moment the turn ends would usually miss it. */
const TRACE_SETTLE_MS = 1500;

/** Refreshes the Turns list after a turn. Only a list on screen is re-read (switch on). */
export function refreshTurnLinesSoon(queryClient: QueryClient, clientId: string): void {
  setTimeout(() => void queryClient.invalidateQueries({ queryKey: copilotTraceKeys.list(clientId) }), TRACE_SETTLE_MS);
}
