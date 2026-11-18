"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KbSaved } from "@/lib/journey/kb-copilot/turn";
import type { ThreadState } from "@/lib/journey/thread/schema";
import type { KbTurnEvent } from "@/lib/journey/thread/turn-events";
import { applyTurnEvent, NO_PROGRESS, type TurnProgress } from "@/lib/journey/thread/turn-progress";
import { copilotThreadService, type KbTurnBody } from "@/services/copilot-thread.service";

// The copilot's saved onboarding thread through TanStack Query. One key for the thread, whichever
// stage page shows it (journey map §2); a turn is sent by the stage's own hook.

export const copilotThreadKeys = {
  all: (clientId: string) => ["copilot-thread", clientId] as const,
  thread: (clientId: string) => [...copilotThreadKeys.all(clientId), "thread"] as const,
  saved: (clientId: string) => [...copilotThreadKeys.all(clientId), "saved"] as const,
};

/** The website or handles the copilot last saved, for the form beside it. `n` counts the saves, so
 *  the form can tell a new one from one it has already shown. */
export type KbSavedEvent = KbSaved & { n: number };

/** The event after a turn: a new one when the turn saved a source, the last one otherwise. */
export function nextSavedEvent(previous: KbSavedEvent | null | undefined, saved: KbSaved): KbSavedEvent | null {
  if (Object.keys(saved).length === 0) return previous ?? null;
  return { ...saved, n: (previous?.n ?? 0) + 1 };
}

/** What the copilot last saved, or null. Nothing is fetched: a turn's answer puts it here
 *  (useSendKbTurn), so the form shows a saved website before the page has been re-read. */
export function useKbCopilotSaved(clientId: string): KbSavedEvent | null {
  return useQuery<KbSavedEvent | null>({
    queryKey: copilotThreadKeys.saved(clientId),
    queryFn: () => null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
  }).data;
}

/** How often the panel re-reads the thread while a build, a collection or a study is running. */
export const THREAD_LIVE_POLL_MS = 3000;
/** How often it re-reads otherwise. The thread is shared: a teammate's message, or something done
 *  on the page beside the panel, has to arrive without a reload. */
export const THREAD_IDLE_POLL_MS = 20_000;

/** Fast while something is running, slow otherwise. A failure that is only being shown is not running. */
export function liveRefetchInterval(state: ThreadState | undefined): number | false {
  if (!state) return false;
  return state.live.some((line) => line.state === "running") ? THREAD_LIVE_POLL_MS : THREAD_IDLE_POLL_MS;
}

/** The thread with the person's message already in it, shown while the turn is in flight. */
export function withPendingMessage(state: ThreadState, body: KbTurnBody): ThreadState {
  return {
    ...state,
    suggestions: [],
    messages: [
      ...state.messages,
      { id: `pending-${Date.now()}`, role: "user", content: body.text, card: null, attachments: body.attachments, suggestions: [], createdAt: new Date().toISOString() },
    ],
  };
}

export function useCopilotThread(clientId: string) {
  return useQuery({
    queryKey: copilotThreadKeys.thread(clientId),
    queryFn: () => copilotThreadService.thread(clientId),
    enabled: Boolean(clientId),
    refetchInterval: (query) => liveRefetchInterval(query.state.data),
  });
}

/** Re-read the thread now. Called by the page beside the panel when it changes something the
 *  copilot talks about (a file added or removed, a build started), so both sides agree at once. */
export function useRefreshCopilotThread(clientId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: copilotThreadKeys.thread(clientId) }),
    [queryClient, clientId],
  );
}

/** One message to the brand KB copilot. Shown at once; rolled back if the request fails. While the
 *  turn runs, what the copilot is doing comes back as `progress`, each save reaches the form the
 *  moment it is stored, and the page on the right is re-read when something else on it changed
 *  (D502). */
export function useSendKbTurn(clientId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = copilotThreadKeys.thread(clientId);
  const [progress, setProgress] = useState<TurnProgress>(NO_PROGRESS);
  const onEvent = (event: KbTurnEvent) => {
    setProgress((current) => applyTurnEvent(current, event));
    if (event.type === "saved") {
      queryClient.setQueryData<KbSavedEvent | null>(copilotThreadKeys.saved(clientId), (previous: KbSavedEvent | null | undefined) => nextSavedEvent(previous, event.saved));
    }
    if (event.type === "page") router.refresh();
  };
  const mutation = useMutation({
    mutationFn: (body: KbTurnBody) => copilotThreadService.kbTurn(clientId, body, onEvent),
    onMutate: async (body) => {
      // A poll in flight would put the older thread back over the message just shown.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ThreadState>(key);
      if (previous) queryClient.setQueryData<ThreadState>(key, withPendingMessage(previous, body));
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      // The server may have stored the message before it failed: read what it really holds.
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: ({ state, changed }) => {
      queryClient.setQueryData(key, state);
      // Saves already reached the form as they happened. This last re-read brings everything else
      // on the page up to date.
      if (changed) router.refresh();
    },
    // Whatever was being shown for the turn in flight goes: the thread now holds the real messages.
    onSettled: () => setProgress(NO_PROGRESS),
  });
  return { ...mutation, progress };
}
