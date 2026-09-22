"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

// One shared Realtime channel per org for `moodboard_items` changes (D276) — the third
// sibling after org-generation-updates.ts and org-version-updates.ts, inheriting both
// of their hard-won lessons:
//
//   1. Filter on org_id EXPLICITLY. RLS alone silently drops postgres_changes rows; only
//      an explicit column filter reliably delivers them. moodboard_items could not be
//      filtered this way until migration 0040 added the column (and 0040's SELECT policy
//      is what lets any row through at all — 0026 left the table default-deny).
//   2. Await the session BEFORE subscribing. Subscribing first opens the websocket with no
//      JWT attached, so RLS evaluates auth.uid() as null and every row is dropped.
//
// event: "*" because every direction matters: UPDATE is the archive task flipping a row
// to `ready`, INSERT is a teammate (or the extension) clipping to a board you have open,
// DELETE is a removal.
//
// Subscribers get the changed row's moodboard_id and NOTHING ELSE. The row is withheld
// on purpose: consumers refetch the board from the server rather than patching a row
// into local state (D159). The id is a FILTER, not payload — the channel is org-wide, so
// without it one Market page would refetch every time anyone in the org clipped to any
// client's board. It is null when the event carries no identifiable row (a DELETE
// without REPLICA IDENTITY FULL), and consumers must treat null as "might be mine".
const channels = new Map<string, RealtimeChannel>();
const listeners = new Map<string, Set<(moodboardId: string | null) => void>>();
const pendingOrgIds = new Set<string>();

/** INSERT carries only `new`, DELETE only `old`, UPDATE both — and the unused side
 *  arrives as `{}`, not null, so `??` would never fall through. Check each side. */
export function moodboardIdFromPayload(payload: { new?: unknown; old?: unknown }): string | null {
  const newRow = payload.new as Record<string, unknown> | null | undefined;
  const oldRow = payload.old as Record<string, unknown> | null | undefined;
  if (typeof newRow?.moodboard_id === "string") return newRow.moodboard_id;
  if (typeof oldRow?.moodboard_id === "string") return oldRow.moodboard_id;
  return null;
}

export function subscribeToOrgMarketUpdates(
  orgId: string,
  onChange: (moodboardId: string | null) => void,
): () => void {
  if (!listeners.has(orgId)) listeners.set(orgId, new Set());
  listeners.get(orgId)!.add(onChange);

  if (!channels.has(orgId) && !pendingOrgIds.has(orgId)) {
    pendingOrgIds.add(orgId);
    const supabase = createBrowserSupabase();
    void supabase.auth.getSession().then(() => {
      pendingOrgIds.delete(orgId);
      if (!listeners.has(orgId)) return; // everyone unsubscribed before this resolved
      const channel = supabase
        .channel(`org-market-updates:${orgId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "moodboard_items",
            filter: `org_id=eq.${orgId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const moodboardId = moodboardIdFromPayload(payload);
            listeners.get(orgId)?.forEach((cb) => cb(moodboardId));
          },
        )
        .subscribe();
      channels.set(orgId, channel);
    });
  }

  return () => {
    const set = listeners.get(orgId);
    if (!set) return;
    set.delete(onChange);
    if (set.size === 0) {
      listeners.delete(orgId);
      const ch = channels.get(orgId);
      if (ch) {
        void createBrowserSupabase().removeChannel(ch);
        channels.delete(orgId);
      }
    }
  };
}
