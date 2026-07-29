"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type GenerationUpdateRow = { node_id: string; status: string };

// One shared Realtime channel per org for `generations` UPDATE events — any number of
// callers (per-node cost, canvas cost) subscribe without each opening its own duplicate
// channel with the identical org_id filter. Filtering on org_id (not node_id/canvas_id,
// neither of which this table's RLS can be trusted to enforce for free) mirrors
// header-credits.tsx's hard-won lesson: RLS alone silently drops postgres_changes rows,
// only an explicit column filter reliably delivers them.
const channels = new Map<string, RealtimeChannel>();
const listeners = new Map<string, Set<(row: GenerationUpdateRow) => void>>();
const pendingOrgIds = new Set<string>();

export function subscribeToOrgGenerationUpdates(
  orgId: string,
  onUpdate: (row: GenerationUpdateRow) => void,
): () => void {
  if (!listeners.has(orgId)) listeners.set(orgId, new Set());
  listeners.get(orgId)!.add(onUpdate);

  if (!channels.has(orgId) && !pendingOrgIds.has(orgId)) {
    pendingOrgIds.add(orgId);
    const supabase = createBrowserSupabase();
    // Await the session before subscribing — subscribing first opens the websocket with no
    // JWT attached, so RLS evaluates auth.uid() as null and silently drops every row (same
    // fix as header-credits.tsx).
    void supabase.auth.getSession().then(() => {
      pendingOrgIds.delete(orgId);
      if (!listeners.has(orgId)) return; // every subscriber unsubscribed before this resolved
      const channel = supabase
        .channel(`org-generation-updates:${orgId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "generations", filter: `org_id=eq.${orgId}` },
          (payload: RealtimePostgresChangesPayload<GenerationUpdateRow>) => {
            const row = payload.new as GenerationUpdateRow;
            listeners.get(orgId)?.forEach((cb) => cb(row));
          },
        )
        .subscribe();
      channels.set(orgId, channel);
    });
  }

  return () => {
    const set = listeners.get(orgId);
    if (!set) return;
    set.delete(onUpdate);
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
