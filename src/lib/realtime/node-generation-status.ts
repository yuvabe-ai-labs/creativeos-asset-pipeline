"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";
import type { GenerationRow } from "@/lib/db/types";

export type NodeGenerationStatusHandlers = {
  onInsert: (row: GenerationRow) => void;
  onUpdate: (row: GenerationRow) => void;
  /** Fires once the channel is live, to close the race window around the handshake. */
  onSubscribed: () => void;
};

// One Realtime channel per node for its `generations` rows, shared by every subscriber (the
// node card and its focus view both mount useVideoGenStatus). The first subscriber's handlers
// drive it: they write the same per-node store state, so one set is enough, and the toast in
// them fires once rather than once per mounted view.
//
// Await the session BEFORE subscribing — the lesson profile-credits.tsx and the org-* channels
// already carry. @supabase/ssr's browser client loads the session lazily, so a channel opened
// first joins with no JWT; RLS then drops every row while the channel still reports SUBSCRIBED.
// Opened at canvas mount, this channel did exactly that: a finished video never cleared the
// skeleton, and only a page refresh (which re-reads the row) showed it.
const channels = new Map<string, RealtimeChannel>();
const subscribers = new Map<string, NodeGenerationStatusHandlers[]>();
const pending = new Set<string>();

export function subscribeToNodeGenerationStatus(
  nodeId: string,
  handlers: NodeGenerationStatusHandlers,
): () => void {
  const list = subscribers.get(nodeId) ?? [];
  list.push(handlers);
  subscribers.set(nodeId, list);

  if (!channels.has(nodeId) && !pending.has(nodeId)) {
    pending.add(nodeId);
    const supabase = createBrowserSupabase();
    void supabase.auth.getSession().then(() => {
      pending.delete(nodeId);
      const first = subscribers.get(nodeId)?.[0];
      if (!first) return; // everyone unsubscribed before the session loaded
      const channel = supabase
        .channel(`video-gen-status:${nodeId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "generations", filter: `node_id=eq.${nodeId}` },
          (payload: RealtimePostgresChangesPayload<GenerationRow>) => first.onInsert(payload.new as GenerationRow),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "generations", filter: `node_id=eq.${nodeId}` },
          (payload: RealtimePostgresChangesPayload<GenerationRow>) => first.onUpdate(payload.new as GenerationRow),
        )
        .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
          if (status === "SUBSCRIBED") first.onSubscribed();
        });
      channels.set(nodeId, channel);
    });
  }

  return () => {
    const remaining = (subscribers.get(nodeId) ?? []).filter((h) => h !== handlers);
    if (remaining.length > 0) {
      subscribers.set(nodeId, remaining);
      return;
    }
    subscribers.delete(nodeId);
    const ch = channels.get(nodeId);
    if (ch) {
      void createBrowserSupabase().removeChannel(ch);
      channels.delete(nodeId);
    }
  };
}
