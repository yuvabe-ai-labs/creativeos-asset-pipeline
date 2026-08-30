"use client";

import { useEffect } from "react";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { authFetch } from "@/lib/supabase/session-ready";
import type { ApprovalStatus } from "@/lib/approval";

// Same value useNodeVersionUpdates and use-review-list use, for the same reason: one
// decision can land as several writes, and a burst should cost one refetch.
const REFRESH_DEBOUNCE_MS = 400;

// R8.3/D202 — keep the on-canvas ApprovalBadge live.
//
// D179 made an OPEN focus view live, but the badge on the node itself had no live path at
// all: `data.approvalStatus` was written only by server hydration (nodeRowToFlow) and by
// the local focus view's own onPatch after the viewer's own decision. So a junior watching
// the canvas saw nothing when a senior approved elsewhere — the badge stayed stale until a
// reload. TC-070/TC-085.
//
// It reads /api/canvases/:cid/approval-statuses, which is a filter over the SAME
// review_queue_items view the drawer, the inbox and the counts read (D159). That matters
// twice over:
//
//   * Correctness. "The badge" and "the queue row pointing at it" are then the same
//     derivation, so they cannot disagree — which is exactly what TC-085 checks.
//   * Cost. ONE canvas-scoped request per debounced burst, not one per changed node. The
//     org channel pings for every generation anywhere in the org, so a per-node fetch
//     would scale with how busy the org is; this scales with nothing.
//
// Two deliberate limits:
//
//   * The realtime ping is still only a FILTER, never data (D159/D179). We refetch on it;
//     we never patch the badge from the payload.
//   * Only `approvalStatus` is written to the store, never `parsed`. Someone else's
//     regeneration replacing the image under a viewer mid-edit is a different decision
//     with a different blast radius (D19), and this hook is not the place to make it.
//
// Writing to the store is safe against autosave: flowToPersisted strips approvalStatus, so
// the save payload is byte-identical to what is already stored (and a read-only session
// never saves at all). The per-node equality check below means the usual ping — a
// generation on someone else's node — writes nothing and so triggers no save at all.
export function useCanvasApprovalSync(canvasId: string) {
  const { orgId } = useIdentity();
  const storeApi = useCanvasStoreApi();

  useEffect(() => {
    if (!orgId || !canvasId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function refresh() {
      try {
        const res = await authFetch(`/api/canvases/${canvasId}/approval-statuses`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { statuses?: Record<string, ApprovalStatus> };
        const statuses = json.statuses ?? {};
        if (cancelled) return;

        // Re-read the store rather than closing over it: nodes can be added or deleted
        // while the request is in flight, and updateNodeData on a missing id is a silent
        // no-op that would hide the race.
        const state = storeApi.getState();
        for (const node of state.nodes) {
          const next = statuses[node.id];
          if (!next) continue; // not an asset node, or no version yet — nothing to show
          const current = (node.data as { approvalStatus?: ApprovalStatus }).approvalStatus;
          if (current === next) continue; // no-op writes would churn autosave for nothing
          state.updateNodeData(node.id, { approvalStatus: next });
        }
      } catch {
        /* best-effort: the badges re-hydrate correctly on the next load */
      }
    }

    const unsubscribe = subscribeToOrgVersionUpdates(orgId, (changedNodeId) => {
      // The channel is ORG-WIDE, so most pings are for canvases nobody here has open.
      // Answered from the store with no round trip. A null nodeId (a DELETE carrying no
      // identifiable row) is treated as "might be mine" — the refetch is one small request
      // and a missed one leaves a badge silently wrong.
      if (changedNodeId !== null) {
        if (!storeApi.getState().nodes.some((n) => n.id === changedNodeId)) return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [orgId, canvasId, storeApi]);
}
