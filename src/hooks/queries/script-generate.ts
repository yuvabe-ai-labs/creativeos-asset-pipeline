"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scriptGenerateService, type TurnMessage } from "@/services/script-generate.service";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import type { PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import { withField } from "@/lib/scripts/copilot/fields";
import { scriptKeys } from "./scripts";
import { keepChips } from "@/lib/scripts/copilot/chips";

// Script copilot spec 2 — the Generate workspace through TanStack Query. Every write returns the
// whole state, so each mutation replaces the cached state with the server's answer.

export function useGenerateState(clientId: string, scriptId: string, initialData: GenerateState) {
  return useQuery({
    queryKey: scriptKeys.generate(clientId, scriptId),
    queryFn: () => scriptGenerateService.state(clientId, scriptId),
    // A refetch (window focus) brings the state without chips; keep the ones the browser holds.
    structuralSharing: (held, fresh) => keepChips(held as GenerateState | undefined, fresh as GenerateState),
    initialData,
    enabled: Boolean(clientId && scriptId),
  });
}

/** Replaces the cached workspace with the server's answer, keeping the copilot's chips the browser
 *  holds: they are not stored, so a fresh state never has them (chips.ts). */
function useSetGenerateState(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return (state: GenerateState) =>
    queryClient.setQueryData<GenerateState>(scriptKeys.generate(clientId, scriptId), (held: GenerateState | undefined) => keepChips(held, state));
}

function useStateWrite<V>(clientId: string, scriptId: string, write: (v: V) => Promise<GenerateState>) {
  const setState = useSetGenerateState(clientId, scriptId);
  return useMutation({
    mutationFn: write,
    onSuccess: (state) => setState(state),
  });
}

/** One chat message. Shown at once; rolled back if the request fails. While a first draft streams,
 *  each preview goes to `onDraft`. */
export function useSendTurn(clientId: string, scriptId: string, onDraft?: (draft: PartialDraft) => void) {
  const queryClient = useQueryClient();
  const setState = useSetGenerateState(clientId, scriptId);
  const key = scriptKeys.generate(clientId, scriptId);
  return useMutation({
    mutationFn: (message: TurnMessage) => scriptGenerateService.turn(clientId, scriptId, message, onDraft),
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GenerateState>(key);
      if (previous) {
        queryClient.setQueryData<GenerateState>(key, {
          ...previous,
          messages: [...previous.messages, { id: `pending-${Date.now()}`, role: "user", content: text, card: null, suggestions: [], createdAt: new Date().toISOString() }],
        });
      }
      return { previous };
    },
    onError: (_error, _text, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (state) => setState(state),
  });
}

/** Typing and Undo. The field changes in the cache at once (spec 2 §9); the server's state lands
 *  only when no later write is still in flight, so a slow reply never puts back an older value. */
export function useSetScriptField(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const setState = useSetGenerateState(clientId, scriptId);
  const key = scriptKeys.generate(clientId, scriptId);
  const mutationKey = [...key, "set-field"];
  return useMutation({
    mutationKey,
    mutationFn: ({ path, value }: { path: string; value: string }) =>
      scriptGenerateService.setField(clientId, scriptId, path, value),
    onMutate: async ({ path, value }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GenerateState>(key);
      const next = previous ? withField(previous, path, value) : null;
      if (next) queryClient.setQueryData(key, next.state);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (state) => {
      if (queryClient.isMutating({ mutationKey }) <= 1) setState(state);
    },
  });
}

export function useInlineEdit(clientId: string, scriptId: string) {
  const setState = useSetGenerateState(clientId, scriptId);
  return useMutation({
    mutationFn: (body: { path: string; selectedText: string; offset: number; instruction: string }) =>
      scriptGenerateService.inlineEdit(clientId, scriptId, body),
    onSuccess: ({ state }) => setState(state),
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

/** Delete a script for good (D384). Every script list for the client changes with it. */
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
