"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { KbSaved } from "@/lib/journey/kb-copilot/turn";
import type { ThreadState } from "@/lib/journey/thread/schema";
import type { KbTurnEvent } from "@/lib/journey/thread/turn-events";
import { applyTurnEvent, NO_PROGRESS, type TurnProgress } from "@/lib/journey/thread/turn-progress";
import { applyTargetEvent, askingTargetOf, NO_TARGET_ACTIVITY, type TargetActivity, type TargetEvent } from "@/lib/journey/thread/target-activity";
import { kbTarget } from "@/lib/journey/kb-copilot/targets";
import { copilotThreadService, type KbTurnBody } from "@/services/copilot-thread.service";
import { refreshTurnLinesSoon } from "./copilot-traces";
import { imageAnalysisKeys } from "./image-analysis";

// The copilot's saved onboarding thread through TanStack Query. One key for the thread, whichever
// stage page shows it (journey map §2); a turn is sent by the stage's own hook.

export const copilotThreadKeys = {
  all: (clientId: string) => ["copilot-thread", clientId] as const,
  thread: (clientId: string) => [...copilotThreadKeys.all(clientId), "thread"] as const,
  saved: (clientId: string) => [...copilotThreadKeys.all(clientId), "saved"] as const,
  /** What the copilot is doing to the page right now (D520). Kept here by the panel; never fetched. */
  activity: (clientId: string) => [...copilotThreadKeys.all(clientId), "activity"] as const,
};

// ── The page shows the copilot's work (D520) ────────────────────────────────

/** Folds one event into the activity the page beside the panel follows. */
export function recordActivity(queryClient: QueryClient, clientId: string, event: TargetEvent): void {
  queryClient.setQueryData<TargetActivity>(copilotThreadKeys.activity(clientId), (a: TargetActivity | undefined) => applyTargetEvent(a ?? NO_TARGET_ACTIVITY, event));
}

/** What the copilot is doing to the page right now. Nothing is fetched: the panel puts it here. */
export function useCopilotActivity(clientId: string): TargetActivity {
  return useQuery<TargetActivity>({
    queryKey: copilotThreadKeys.activity(clientId),
    queryFn: () => NO_TARGET_ACTIVITY,
    enabled: false,
    initialData: NO_TARGET_ACTIVITY,
    staleTime: Infinity,
  }).data;
}

export function useRecordCopilotActivity(clientId: string): (event: TargetEvent) => void {
  const queryClient = useQueryClient();
  return useCallback((event: TargetEvent) => recordActivity(queryClient, clientId, event), [queryClient, clientId]);
}

/** The one definition of the thread query: its key and how it is read. Every observer of the thread
 *  is built from it, because a query keeps the options of whichever observer rendered last: one with
 *  no real `queryFn` would make "refresh the thread now" fail without a word (review fix). */
export function threadQueryOptions(clientId: string) {
  return queryOptions({
    queryKey: copilotThreadKeys.thread(clientId),
    queryFn: () => copilotThreadService.thread(clientId),
  });
}

const selectAskingTarget = (s: ThreadState) => askingTargetOf(s, kbTarget.field);

/** The page's read-only view of the thread the panel holds: never fetches or polls by itself
 *  (`enabled: false`), so the page adds no request. */
export function askingTargetOptions(clientId: string) {
  return { ...threadQueryOptions(clientId), enabled: false, select: selectAskingTarget };
}

/** The target of the question the thread waits on: null when none is, undefined while the thread
 *  has not loaded yet (so a page can tell "nothing is asked" from "not known yet"). */
export function useAskingTarget(clientId: string): string | null | undefined {
  return useQuery(askingTargetOptions(clientId)).data;
}

/** The "asked" event after a turn, or null when the asked target did not change: the same question
 *  asked again after the person talked about something else does not move the page (spec §3.3). */
export function askedAfterTurn(before: ThreadState | undefined, after: ThreadState): TargetEvent | null {
  const now = askingTargetOf(after, kbTarget.field);
  if (!now || now === askingTargetOf(before, kbTarget.field)) return null;
  return { type: "asked", target: now };
}

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
    ...threadQueryOptions(clientId),
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

/** Puts a finished turn's thread in the cache. A thread read already in flight started before the
 *  reply was stored, so it is cancelled first: landing late, it would put the older thread back. */
export async function finishTurn(queryClient: QueryClient, key: readonly unknown[], state: ThreadState): Promise<void> {
  await queryClient.cancelQueries({ queryKey: key });
  queryClient.setQueryData(key, state);
}

/** A person approves or discards a change card (D517). The thread comes back settled, and the page
 *  on the right is re-read, since an approval changed fields on it. */
export function useDecideChange(clientId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = copilotThreadKeys.thread(clientId);
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: { decision: "approve"; keep: string[] } | { decision: "discard" } }) =>
      copilotThreadService.decideChange(clientId, messageId, body),
    onSuccess: async ({ state }, { messageId, body }) => {
      await finishTurn(queryClient, key, state);
      router.refresh();
      // The Image Analysis tab reads its section through its own query, not the page re-read: an
      // approved image-study card shows there at once (piece 2b).
      void queryClient.invalidateQueries({ queryKey: imageAnalysisKeys.status(clientId) });
      // A person's own approval lands the changed fields where they are, without moving the page.
      if (body.decision !== "approve") return;
      const card = state.messages.find((m) => m.id === messageId)?.card;
      if (card?.kind !== "change") return;
      for (const path of card.decision?.kept ?? []) recordActivity(queryClient, clientId, { type: "written", target: kbTarget.field(path), move: false });
    },
    // Settled by someone else meanwhile, or the write failed: show what is really stored.
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** One message to the brand KB copilot. Shown at once; rolled back if the request fails. While the
 *  turn runs, what the copilot is doing comes back as `progress`, each save reaches the form the
 *  moment it is stored, and the page on the right is re-read when something else on it changed
 *  (D514). */
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
    // The page beside the panel follows what this browser's turn changes (D520).
    if (event.type === "target") recordActivity(queryClient, clientId, { type: event.phase, target: event.target, move: true });
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
    onSuccess: async ({ state, changed }, _body, context) => {
      await finishTurn(queryClient, key, state);
      // A new question about a different field: the page goes there.
      const asked = askedAfterTurn(context?.previous, state);
      if (asked) recordActivity(queryClient, clientId, asked);
      // Saves already reached the form as they happened. This last re-read brings everything else
      // on the page up to date.
      if (changed) router.refresh();
    },
    // Whatever was being shown for the turn in flight goes: the thread now holds the real messages.
    onSettled: () => {
      setProgress(NO_PROGRESS);
      // However the turn ended, nothing is being written any more: no shimmer outlives it.
      recordActivity(queryClient, clientId, { type: "endTurn" });
      // The turn's trace (D521), for the Turns list when it is on screen.
      refreshTurnLinesSoon(queryClient, clientId);
    },
  });
  return { ...mutation, progress };
}
