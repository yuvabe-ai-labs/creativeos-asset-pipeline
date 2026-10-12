"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  useCanvasStore,
  useCanvasStoreApi,
} from "@/components/canvas/canvas-store-provider";
import type { GenerationRow } from "@/lib/db/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { completionEffect } from "@/lib/generations/node-status";
import { revalidateCanvasGenerations } from "@/hooks/use-canvas-generations";

/**
 * Canvas-level Generation Tray data source. One Realtime channel per canvas on the
 * `generations` table; events are filtered to this canvas's node ids client-side
 * (job rows carry node_id, not canvas_id — we deliberately don't denormalize one).
 * D366 — it is also every node's generation status (useGenerationStatus selects from it) and the
 * one place a finished job is announced.
 */
export function useGenerationTray(canvasId: string): void {
  const setTrayJobs = useCanvasStore((s) => s.setTrayJobs);
  const upsertTrayJob = useCanvasStore((s) => s.upsertTrayJob);
  const storeApi = useCanvasStoreApi();

  // Hydrate: latest generations for this canvas's nodes (reconstructs after refresh).
  useEffect(() => {
    let cancelled = false;
    const nodeIds = storeApi.getState().nodes.map((n) => n.id);
    if (nodeIds.length === 0) return;
    const supabase = createBrowserSupabase();
    supabase
      .from("generations")
      .select("*")
      .in("node_id", nodeIds)
      .order("created_at", { ascending: false })
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled || error || !data) return;
        setTrayJobs(data as GenerationRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [canvasId, setTrayJobs, storeApi]);

  // Live: one channel for the whole canvas; ignore rows for other canvases' nodes. This is also
  // where a finished job is announced and an image lands on its card (D366) — once per canvas,
  // never once per node.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Await the session BEFORE subscribing: a channel opened without a JWT is dropped by RLS while
    // still reporting SUBSCRIBED (the lesson the old per-node subscription recorded).
    void supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`generation-tray:${canvasId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "generations" },
          (payload: RealtimePostgresChangesPayload<GenerationRow>) => {
            const row = payload.new as GenerationRow;
            if (!row?.id) return;
            const state = storeApi.getState();
            if (row.node_id === null || !state.nodes.some((n) => n.id === row.node_id)) return;
            const effect = completionEffect(state.trayJobs[row.id], row);
            upsertTrayJob(row);
            if (!effect) return;
            if (effect.toast.tone === "success") toast.success(effect.toast.message);
            else toast.error(effect.toast.message);
            if (effect.cardImage) {
              state.updateNodeData(row.node_id, { parsed: effect.cardImage, approvalStatus: "pending" });
            }
            if (effect.toast.tone === "success") void revalidateCanvasGenerations();
          },
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [canvasId, upsertTrayJob, storeApi]);
}
