"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { avatarsService } from "@/services/avatars.service";
import { isNotFound } from "@/services/read-json";
import type { Avatar, VoicePreview } from "@/lib/avatars/schema";

// D300 — the avatars resource, through TanStack Query (CLAUDE.md, "Data fetching"). The keys are
// built here and nowhere else.
export const avatarKeys = {
  all: (clientId: string) => ["avatars", clientId] as const,
  list: (clientId: string) => [...avatarKeys.all(clientId), "list"] as const,
  detail: (clientId: string, avatarId: string) => [...avatarKeys.all(clientId), "detail", avatarId] as const,
  voicePreview: (clientId: string, avatarId: string) =>
    [...avatarKeys.all(clientId), "voice-preview", avatarId] as const,
};

/** The client's avatars, drafts included. The list is edited in the Avatar Studio, a different
 *  page, so it revalidates whenever a reader mounts — the cached rows show at once and are
 *  replaced if the Studio changed them. */
export function useAvatars(clientId: string) {
  return useQuery({
    queryKey: avatarKeys.list(clientId),
    queryFn: () => avatarsService.list(clientId),
    enabled: Boolean(clientId),
    staleTime: 0,
  });
}

/** The avatars in the library — saved, ready to use. What the canvas offers (D298). */
export function useLibraryAvatars(clientId: string) {
  return useQuery({
    queryKey: avatarKeys.list(clientId),
    queryFn: () => avatarsService.list(clientId),
    enabled: Boolean(clientId),
    staleTime: 0,
    select: (avatars: Avatar[]) => avatars.filter((a) => a.status === "ready"),
  });
}

/** Refetch the client's avatar list — the gallery header's refresh button. */
export function useRefreshAvatars(clientId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: avatarKeys.list(clientId) });
}

export type AvatarLookup =
  | { status: "loading"; avatar: null }
  | { status: "ready"; avatar: Avatar }
  | { status: "gone"; avatar: null };

/** One avatar by id. Seeded from the cached list, so a node whose avatar is already listed never
 *  fetches; one that is not (archived since it was placed — the list leaves archived avatars out)
 *  is fetched once. A 404 — deleted, or another client's id — is "gone", never retried. */
export function useAvatar(clientId: string, avatarId: string): AvatarLookup {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: avatarKeys.detail(clientId, avatarId),
    queryFn: () => avatarsService.get(clientId, avatarId),
    enabled: Boolean(clientId && avatarId),
    initialData: () =>
      queryClient.getQueryData<Avatar[]>(avatarKeys.list(clientId))?.find((a) => a.id === avatarId),
    initialDataUpdatedAt: () => queryClient.getQueryState(avatarKeys.list(clientId))?.dataUpdatedAt,
    retry: (failures, error) => !isNotFound(error) && failures < 1,
  });
  if (!avatarId || isNotFound(query.error)) return { status: "gone", avatar: null };
  if (query.data) return { status: "ready", avatar: query.data };
  return { status: "loading", avatar: null };
}

const PREVIEW_POLL_MS = 4000;

export type VoicePreviewData = { preview: VoicePreview | null; estimateCredits: number | null };

/** The avatar's latest voice preview and what the next one costs (D294, D296). While one is
 *  running it is polled; once it settles, polling stops on its own. */
export function useVoicePreviewQuery(
  clientId: string,
  avatarId: string | null,
  declaration: string | null,
  /** What the page read on the server, for the declaration it was read under. */
  initial?: { declaration: string | null; data: VoicePreviewData } | null,
) {
  return useQuery({
    // The estimate depends on the declaration, so a declaration change is a different query.
    queryKey: [...avatarKeys.voicePreview(clientId, avatarId ?? ""), declaration] as const,
    queryFn: () => avatarsService.getVoicePreview(clientId, avatarId!),
    enabled: Boolean(clientId && avatarId),
    // Only for the declaration it was read under: another voice has another estimate.
    initialData: initial && initial.declaration === declaration ? initial.data : undefined,
    refetchInterval: (query) => (query.state.data?.preview?.status === "running" ? PREVIEW_POLL_MS : false),
  });
}

/** Start a preview. The running preview it returns is written into every cached copy of this
 *  avatar's preview query, so polling begins at once. */
export function useStartVoicePreview(clientId: string, avatarId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (line: string) => avatarsService.startVoicePreview(clientId, avatarId!, line),
    onSuccess: (preview: VoicePreview | null) => {
      if (!avatarId) return;
      queryClient.setQueriesData<VoicePreviewData>(
        { queryKey: avatarKeys.voicePreview(clientId, avatarId) },
        (old: VoicePreviewData | undefined) => (old ? { ...old, preview } : old),
      );
    },
  });
}
