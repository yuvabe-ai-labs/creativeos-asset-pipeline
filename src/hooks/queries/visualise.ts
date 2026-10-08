"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { visualiseService } from "@/services/visualise.service";
import type { Script } from "@/lib/scripts/schema";
import type { VisualiseBoard } from "@/lib/scripts/visualise/schema";
import { hasLiveDraw } from "@/lib/scripts/visualise/state";
import { avatarKeys } from "./avatars";

// Spec 3 — the Visualise board through TanStack Query (D300). Keys are built here only.
export type BoardData = { script: Script; board: VisualiseBoard };

export const visualiseKeys = {
  board: (clientId: string, scriptId: string) => ["visualise", clientId, scriptId] as const,
};

const POLL_MS = 4000;

/** The script and its board, seeded from the page. While any take is still drawing (another
 *  tab's Generate all, a reload mid-draw) it is polled; once all settle, polling stops. */
export function useVisualiseBoard(clientId: string, scriptId: string, initial: BoardData) {
  return useQuery({
    queryKey: visualiseKeys.board(clientId, scriptId),
    queryFn: () => visualiseService.board(clientId, scriptId),
    initialData: initial,
    refetchInterval: (query) => (hasLiveDraw(query.state.data?.board.takes ?? [], Date.now()) ? POLL_MS : false),
  });
}

export function useLinkCast(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const key = visualiseKeys.board(clientId, scriptId);
  return useMutation({
    mutationFn: ({ castId, avatarId }: { castId: string; avatarId: string | null }) =>
      visualiseService.linkCast(clientId, scriptId, castId, avatarId),
    onSuccess: (script) => queryClient.setQueryData<BoardData>(key, (prev: BoardData | undefined) => (prev ? { ...prev, script } : prev)),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: avatarKeys.list(clientId) }),
    ]),
  });
}

export function usePickTake(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const key = visualiseKeys.board(clientId, scriptId);
  return useMutation({
    mutationFn: ({ shotId, takeId }: { shotId: string; takeId: string }) =>
      visualiseService.pick(clientId, scriptId, shotId, takeId),
    onMutate: ({ shotId, takeId }) =>
      queryClient.setQueryData<BoardData>(key, (prev: BoardData | undefined) =>
        prev ? { ...prev, board: { ...prev.board, picks: { ...prev.board.picks, [shotId]: takeId } } } : prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useReopenScript(clientId: string, scriptId: string) {
  return useMutation({ mutationFn: () => visualiseService.reopen(clientId, scriptId) });
}
