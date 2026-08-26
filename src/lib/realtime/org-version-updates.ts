"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

// One shared Realtime channel per org for `node_versions` changes — the sibling of
// org-generation-updates.ts, and it inherits both of that file's hard-won lessons:
//
//   1. Filter on org_id EXPLICITLY. RLS alone silently drops postgres_changes rows; only
//      an explicit column filter reliably delivers them. node_versions could not be
//      filtered this way at all until migration 0030 added the column (and 0030's SELECT
//      policy is what lets any row through in the first place — 0017 had left the table
//      default-deny with zero policies).
//   2. Await the session BEFORE subscribing. Subscribing first opens the websocket with no
//      JWT attached, so RLS evaluates auth.uid() as null and every row is dropped — the
//      same fix profile-credits.tsx documents.
//
// event: "*" because both directions are requirements — INSERT drives R8.2 (a senior
// watching sees the count rise as a junior generates), UPDATE drives R8.3 (a junior
// watching sees their badge change when a senior decides).
//
// Subscribers get the changed row's node_id and NOTHING ELSE (D179). The row itself is
// deliberately still withheld: every consumer re-derives from the server — a count is a
// grouped aggregate, not something a single row can be patched into — so handing over the
// payload would invite patching state locally and drifting away from the one derivation
// (D159). The node id is not payload-for-patching, it is a FILTER: this channel is
// org-wide, so without it an open focus view would refetch every time anyone in the org
// generated anything. It is null when the event carries no identifiable row (a DELETE
// without REPLICA IDENTITY FULL), and consumers must treat null as "might be mine".
const channels = new Map<string, RealtimeChannel>();
const listeners = new Map<string, Set<(nodeId: string | null) => void>>();
const pendingOrgIds = new Set<string>();

export function subscribeToOrgVersionUpdates(
  orgId: string,
  onChange: (nodeId: string | null) => void,
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
        .channel(`org-version-updates:${orgId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "node_versions",
            filter: `org_id=eq.${orgId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            // INSERT carries only `new`, DELETE only `old`, UPDATE both — and the unused
            // side arrives as `{}`, not null, so `??` would never fall through. Check each
            // explicitly and fall back to null rather than guessing.
            const newRow = payload.new as Record<string, unknown> | null;
            const oldRow = payload.old as Record<string, unknown> | null;
            const nodeId =
              typeof newRow?.node_id === "string"
                ? newRow.node_id
                : typeof oldRow?.node_id === "string"
                  ? oldRow.node_id
                  : null;
            listeners.get(orgId)?.forEach((cb) => cb(nodeId));
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
