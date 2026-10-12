"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useCanvasStore, useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import type { GenerationRow } from "@/lib/db/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { completionEffect, completionEffects, type CompletionEffect } from "@/lib/generations/node-status";
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

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // A job seen running that has now finished: announce it and put an image on its card (D366).
    const applyCompletion = (nodeId: string, effect: CompletionEffect) => {
      if (effect.toast.tone === "success") toast.success(effect.toast.message);
      else toast.error(effect.toast.message);
      if (effect.cardImage) {
        storeApi.getState().updateNodeData(nodeId, {
          parsed: effect.cardImage,
          approvalStatus: "pending",
        });
      }
      if (effect.toast.tone === "success") void revalidateCanvasGenerations();
    };

    // Hydrate: latest generations for this canvas's nodes (reconstructs after refresh). Runs on
    // mount and again each time the channel (re)subscribes, so a job that changed while no channel
    // was listening is caught up; setTrayJobs merges, so a late result never undoes a live update.
    const hydrate = () => {
      const nodeIds = storeApi.getState().nodes.map((n) => n.id);
      if (nodeIds.length === 0) return;
      supabase
        .from("generations")
        .select("*")
        .in("node_id", nodeIds)
        .order("created_at", { ascending: false })
        .then(({ data, error }: { data: unknown; error: unknown }) => {
          if (cancelled || error || !data) return;
          const state = storeApi.getState();
          const rows = data as GenerationRow[];
          // A job that finished while no channel was listening (a reconnect, or before the first
          // subscribe) is announced here, judged against what the store held before this load.
          const onCanvas = rows.filter((r) => r.node_id !== null && state.nodes.some((n) => n.id === r.node_id));
          const finished = completionEffects(state.trayJobs, onCanvas);
          setTrayJobs(rows);
          for (const { row, effect } of finished) applyCompletion(row.node_id!, effect);
        });
    };
    hydrate();

    // Live: one channel for the whole canvas; ignore rows for other canvases' nodes. This is also
    // where a finished job is announced and an image lands on its card (D366) — once per canvas,
    // never once per node.
    // Await the session BEFORE subscribing: a channel opened without a JWT is dropped by RLS while
    // still reporting SUBSCRIBED (the lesson the old per-node subscription recorded).
    supabase.auth
      .getSession()
      .then(() => {
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
              if (effect) applyCompletion(row.node_id, effect);
            },
          )
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") hydrate();
          });
      })
      .catch((e: unknown) => {
        console.error("[useGenerationTray] session load failed", e);
      });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [canvasId, setTrayJobs, upsertTrayJob, storeApi]);
}
