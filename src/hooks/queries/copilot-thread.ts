"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ThreadState } from "@/lib/journey/thread/schema";
import { copilotThreadService, type KbTurnBody } from "@/services/copilot-thread.service";

// The copilot's saved onboarding thread through TanStack Query. One key for the thread, whichever
// stage page shows it (journey map §2); a turn is sent by the stage's own hook.

export const copilotThreadKeys = {
  all: (clientId: string) => ["copilot-thread", clientId] as const,
  thread: (clientId: string) => [...copilotThreadKeys.all(clientId), "thread"] as const,
};

/** How often the panel re-reads the thread while a build, a collection or a study is running. */
export const THREAD_LIVE_POLL_MS = 3000;

/** Poll only while something is running; stop the moment nothing is. */
export function liveRefetchInterval(state: ThreadState | undefined): number | false {
  return state && state.live.length > 0 ? THREAD_LIVE_POLL_MS : false;
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

/** One message to the brand KB copilot. Shown at once; rolled back if the request fails. When the
 *  turn saved or started something, the page on the right is re-read so both sides agree. */
export function useSendKbTurn(clientId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = copilotThreadKeys.thread(clientId);
  return useMutation({
    mutationFn: (body: KbTurnBody) => copilotThreadService.kbTurn(clientId, body),
    onMutate: async (body) => {
      // A poll in flight would put the older thread back over the message just shown.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ThreadState>(key);
      if (previous) queryClient.setQueryData<ThreadState>(key, withPendingMessage(previous, body));
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: ({ state, changed }) => {
      queryClient.setQueryData(key, state);
      if (changed) router.refresh();
    },
  });
}
