"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { VideoGenJobKind } from "@/lib/canvas-store";
import type { GenerationRow } from "@/lib/db/types";
import { subscribeToNodeGenerationStatus } from "@/lib/realtime/node-generation-status";

export type VideoGenStatus = {
  isGenerating: boolean;
  /** D284 — true while the running job is a voice change rather than a fresh video. */
  isChangingVoice: boolean;
  lastError: string | null;
  setGenerating: (v: boolean) => void;
  setLastError: (v: string | null) => void;
};

const jobKind = (type: string | null | undefined): VideoGenJobKind => (type === "voice" ? "voice" : "video");

export function useVideoGenStatus(nodeId: string): VideoGenStatus {
  const status = useCanvasStore((s) => s.videoGenStatus[nodeId]);
  const setVideoGenGenerating = useCanvasStore((s) => s.setVideoGenGenerating);
  const setVideoGenError = useCanvasStore((s) => s.setVideoGenError);

  const isGenerating = status?.isGenerating ?? false;
  const isChangingVoice = isGenerating && status?.kind === "voice";
  const lastError = status?.lastError ?? null;
  const setGenerating = (v: boolean) => setVideoGenGenerating(nodeId, v);
  const setLastError = (v: string | null) => setVideoGenError(nodeId, v);

  // Hydrate from DB on mount — picks up a running generation after page refresh.
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabase();
    supabase
      .from("generations")
      .select("id, status, type")
      .eq("node_id", nodeId)
      .eq("status", "running")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return;
        if (error) { console.error("[useVideoGenStatus] hydration failed", error); return; }
        const row = data as Pick<GenerationRow, "type"> | null;
        if (row) setVideoGenGenerating(nodeId, true, jobKind(row.type));
      });
    return () => { cancelled = true; };
  }, [nodeId, setVideoGenGenerating]);

  // Shared Realtime subscription (one channel per node, opened once the session has loaded —
  // see node-generation-status.ts for why that order matters).
  useEffect(() => {
    const supabase = createBrowserSupabase();
    return subscribeToNodeGenerationStatus(nodeId, {
      onInsert: (gen) => {
        if (gen.status === "running") {
          setVideoGenGenerating(nodeId, true, jobKind(gen.type));
          setVideoGenError(nodeId, null);
        }
      },
      onUpdate: (gen) => {
        const voice = gen.type === "voice";
        if (gen.status === "succeeded") {
          setVideoGenGenerating(nodeId, false);
          setVideoGenError(nodeId, null);
          toast.success(voice ? "Voice changed — added as a new version" : "Video ready");
        } else if (gen.status === "failed") {
          const fallback = voice ? "Voice change failed" : "Generation failed";
          setVideoGenGenerating(nodeId, false);
          setVideoGenError(nodeId, gen.error ?? fallback);
          toast.error(gen.error ?? fallback);
        }
      },
      onSubscribed: async () => {
        // Close the race window: check if generation completed during subscription handshake.
        const { data } = await supabase
          .from("generations")
          .select("id, status, error")
          .eq("node_id", nodeId)
          .in("status", ["succeeded", "failed"] as GenerationRow["status"][])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() as { data: Pick<GenerationRow, "id" | "status" | "error"> | null; error: unknown };
        if (data?.status === "succeeded") {
          setVideoGenGenerating(nodeId, false);
          setVideoGenError(nodeId, null);
        } else if (data?.status === "failed") {
          setVideoGenGenerating(nodeId, false);
          setVideoGenError(nodeId, data.error ?? "Generation failed");
        }
      },
    });
  }, [nodeId, setVideoGenGenerating, setVideoGenError]);

  return { isGenerating, isChangingVoice, lastError, setGenerating, setLastError };
}
