"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientReviewService } from "@/services/client-review.service";
import { withAddedComment, withEditedComment } from "@/lib/client-review/utils";
import type { PublicReview, ReviewComment } from "@/lib/client-review/wire";

// D307 client review share, through TanStack Query (CLAUDE.md, "Data fetching"). The keys are
// built here and nowhere else. Both queries keep the app defaults (staleTime 30 s, no refetch on
// window focus, no polling): the canvas node refreshes when its focus view opens or closes, and
// the public page refreshes only after the reviewer's own post or edit.
export const clientReviewKeys = {
  node: (nodeId: string) => ["client-review", "node", nodeId] as const,
  public: (token: string) => ["client-review", "public", token] as const,
};

/** The canvas node's cut and comments. The card and its focus view read this one query; an
 *  upload writes its finalize result straight into it. */
export function useNodeClientReview(nodeId: string) {
  return useQuery({
    queryKey: clientReviewKeys.node(nodeId),
    queryFn: () => clientReviewService.getForNode(nodeId),
    enabled: Boolean(nodeId),
  });
}

/** The public review behind a share link. Seeded with what the page rendered on the server, so
 *  the first paint never refetches. */
export function usePublicReview(token: string, initial: PublicReview) {
  return useQuery({
    queryKey: clientReviewKeys.public(token),
    queryFn: () => clientReviewService.getPublic(token),
    initialData: initial,
  });
}

/** Post a comment. On success the returned comment is in the cache at once; the refetch after
 *  it is best-effort and its failure never reaches the caller. */
export function usePostComment(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { authorName: string; body: string; timecodeMs: number }) =>
      clientReviewService.postComment(token, input),
    onSuccess: (comment: ReviewComment) => {
      queryClient.setQueryData<PublicReview>(clientReviewKeys.public(token), (r: PublicReview | undefined) =>
        withAddedComment(r, comment),
      );
      void queryClient.invalidateQueries({ queryKey: clientReviewKeys.public(token) });
    },
  });
}

/** Edit a comment's text. Same cache contract as usePostComment. */
export function useEditComment(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, ...input }: { commentId: string; editorName: string; body: string }) =>
      clientReviewService.editComment(token, commentId, input),
    onSuccess: (comment: ReviewComment) => {
      queryClient.setQueryData<PublicReview>(clientReviewKeys.public(token), (r: PublicReview | undefined) =>
        withEditedComment(r, comment),
      );
      void queryClient.invalidateQueries({ queryKey: clientReviewKeys.public(token) });
    },
  });
}
