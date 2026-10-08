// src/hooks/queries/script-review.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scriptReviewService } from "@/services/script-review.service";
import { scriptKeys } from "@/hooks/queries/scripts";
import { visualiseKeys } from "@/hooks/queries/visualise";
import { upsertComment } from "@/lib/script-review/utils";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import type { ShareScope, TeamStageMove } from "@/lib/script-review/constants";
import type { Part, ScriptComment } from "@/lib/script-review/types";

// Script copilot spec 4, through TanStack Query (CLAUDE.md, "Data fetching"). Keys are built here
// only. App defaults otherwise (staleTime 30 s, no polling): the client page refreshes after the
// client's own writes, the team view after the team's own writes and on load.
export const scriptReviewKeys = {
  team: (clientId: string, scriptId: string) => ["script-review", "team", clientId, scriptId] as const,
  public: (token: string) => ["script-review", "public", token] as const,
};

export function useTeamScriptReview(clientId: string, scriptId: string) {
  return useQuery({
    queryKey: scriptReviewKeys.team(clientId, scriptId),
    queryFn: () => scriptReviewService.getTeam(clientId, scriptId),
    enabled: Boolean(clientId && scriptId),
  });
}

export function useMoveScriptStage(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (move: TeamStageMove) => scriptReviewService.moveStage(clientId, scriptId, move),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) });
      // The library's stage filter and the gallery's Scripts tab (approved scripts) read these.
      void queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) });
      // Visualise reads the stage from its own board query (Reopen shows only at Visualise).
      void queryClient.invalidateQueries({ queryKey: visualiseKeys.board(clientId, scriptId) });
    },
  });
}

export function useShareScript(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: ShareScope) => scriptReviewService.share(clientId, scriptId, scope),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) }),
  });
}

export function useReplyToThread(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      scriptReviewService.reply(clientId, scriptId, commentId, body),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) }),
  });
}

export function useResolveThread(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      scriptReviewService.setResolved(clientId, scriptId, commentId, resolved),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) }),
  });
}

/** Seeded with what the page rendered on the server, so the first paint never refetches. */
export function usePublicScriptReview(token: string, initial: PublicScriptReview) {
  return useQuery({
    queryKey: scriptReviewKeys.public(token),
    queryFn: () => scriptReviewService.getPublic(token),
    initialData: initial,
  });
}

function usePublicWrite<TInput>(token: string, write: (input: TInput) => Promise<ScriptComment | void>) {
  const queryClient = useQueryClient();
  const key = scriptReviewKeys.public(token);
  return useMutation({
    mutationFn: write,
    onSuccess: (comment) => {
      if (comment) {
        queryClient.setQueryData<PublicScriptReview>(key, (r: PublicScriptReview | undefined) => (r ? { ...r, comments: upsertComment(r.comments, comment) } : r));
      }
    },
    // After success the list is already right; after a refusal (a newer version, an approval) the
    // page is behind. Either way, refresh in the background.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function usePostScriptComment(token: string) {
  return usePublicWrite(token, (input: { authorName: string; body: string; part: Part; versionNumber: number }) =>
    scriptReviewService.postComment(token, input),
  );
}

export function useEditScriptComment(token: string) {
  return usePublicWrite(token, ({ commentId, ...input }: { commentId: string; editorName: string; body: string }) =>
    scriptReviewService.editComment(token, commentId, input),
  );
}

export function useApproveScript(token: string) {
  return usePublicWrite(token, (input: { approverName: string; versionNumber: number }) => scriptReviewService.approve(token, input));
}
