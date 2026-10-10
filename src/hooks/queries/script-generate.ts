"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scriptGenerateService, type TurnMessage } from "@/services/script-generate.service";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import type { PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import { scriptKeys } from "./scripts";

// Script copilot spec 2 — the Generate workspace through TanStack Query. Every write returns the
// whole state, so each mutation replaces the cached state with the server's answer.

export function useGenerateState(clientId: string, scriptId: string, initialData: GenerateState) {
  return useQuery({
    queryKey: scriptKeys.generate(clientId, scriptId),
    queryFn: () => scriptGenerateService.state(clientId, scriptId),
    initialData,
    enabled: Boolean(clientId && scriptId),
  });
}

function useStateWrite<V>(clientId: string, scriptId: string, write: (v: V) => Promise<GenerateState>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (state) => queryClient.setQueryData(scriptKeys.generate(clientId, scriptId), state),
  });
}

/** One chat message. Shown at once; rolled back if the request fails. While a first draft streams,
 *  each preview goes to `onDraft`. */
export function useSendTurn(clientId: string, scriptId: string, onDraft?: (draft: PartialDraft) => void) {
  const queryClient = useQueryClient();
  const key = scriptKeys.generate(clientId, scriptId);
  return useMutation({
    mutationFn: (message: TurnMessage) => scriptGenerateService.turn(clientId, scriptId, message, onDraft),
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GenerateState>(key);
      if (previous) {
        queryClient.setQueryData<GenerateState>(key, {
          ...previous,
          messages: [...previous.messages, { id: `pending-${Date.now()}`, role: "user", content: text, card: null, createdAt: new Date().toISOString() }],
        });
      }
      return { previous };
    },
    onError: (_error, _text, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (state) => queryClient.setQueryData(key, state),
  });
}

export function useSetScriptField(clientId: string, scriptId: string) {
  return useStateWrite(clientId, scriptId, ({ path, value }: { path: string; value: string }) =>
    scriptGenerateService.setField(clientId, scriptId, path, value));
}

export function useInlineEdit(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string; selectedText: string; offset: number; instruction: string }) =>
      scriptGenerateService.inlineEdit(clientId, scriptId, body),
    onSuccess: ({ state }) => queryClient.setQueryData(scriptKeys.generate(clientId, scriptId), state),
  });
}

export function useResolveProposal(clientId: string, scriptId: string) {
  return useStateWrite(clientId, scriptId, ({ messageId, decision }: { messageId: string; decision: "accept" | "reject" }) =>
    scriptGenerateService.resolveProposal(clientId, scriptId, messageId, decision));
}

export function useLinkCastAvatar(clientId: string, scriptId: string) {
  return useStateWrite(clientId, scriptId, ({ castId, avatarId }: { castId: string; avatarId: string | null }) =>
    scriptGenerateService.linkAvatar(clientId, scriptId, castId, avatarId));
}

/** Generate → Visualise. The library and every other script list change with it. */
export function useMarkFinal(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => scriptGenerateService.markFinal(clientId, scriptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) }),
  });
}

/** Delete an unwritten script. Every script list for the client changes with it. */
export function useDeleteScript(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scriptId: string) => scriptGenerateService.remove(clientId, scriptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) }),
  });
}

export function useCreateScript(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => scriptGenerateService.create(clientId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) }),
  });
}
