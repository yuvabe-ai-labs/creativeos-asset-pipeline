"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  useCanvasStore,
  useCanvasStoreApi,
} from "@/components/canvas/canvas-store-provider";
import type { GenerationRow } from "@/lib/db/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Canvas-level Generation Tray data source. One Realtime channel per canvas on the
 * `generations` table; events are filtered to this canvas's node ids client-side
 * (job rows carry node_id, not canvas_id — we deliberately don't denormalize one).
 * Coexists with the per-node use-video-gen-status subscription (separate concern).
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

  // Live: one channel for the whole canvas; ignore rows for other canvases' nodes.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`generation-tray:${canvasId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generations" },
        (payload: RealtimePostgresChangesPayload<GenerationRow>) => {
          const row = payload.new as GenerationRow;
          if (!row?.id) return;
          const ids = new Set(storeApi.getState().nodes.map((n) => n.id));
          if (!ids.has(row.node_id)) return;
          upsertTrayJob(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canvasId, upsertTrayJob, storeApi]);
}
