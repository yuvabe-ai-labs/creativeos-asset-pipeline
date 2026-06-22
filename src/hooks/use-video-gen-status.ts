"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { GenerationRow } from "@/lib/db/types";

export type VideoGenStatus = {
  isGenerating: boolean;
  lastError: string | null;
  setGenerating: (v: boolean) => void;
  setLastError: (v: string | null) => void;
};

export function useVideoGenStatus(nodeId: string): VideoGenStatus {
  const [isGenerating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Hydrate from DB on mount — picks up running generation after page refresh
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase
      .from("generations")
      .select("id, status")
      .eq("node_id", nodeId)
      .eq("status", "running")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setGenerating(true);
      });
  }, [nodeId]);

  // Realtime: INSERT = new generation started; UPDATE = generation finished
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`video-gen-status:${nodeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "generations",
          filter: `node_id=eq.${nodeId}`,
        },
        (payload) => {
          const gen = payload.new as GenerationRow;
          if (gen.status === "running") {
            setGenerating(true);
            setLastError(null);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `node_id=eq.${nodeId}`,
        },
        (payload) => {
          const gen = payload.new as GenerationRow;
          if (gen.status === "succeeded") {
            setGenerating(false);
            setLastError(null);
            toast.success("Video ready");
          }
          if (gen.status === "failed") {
            setGenerating(false);
            setLastError(gen.error ?? "Generation failed");
            toast.error(gen.error ?? "Generation failed");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nodeId]);

  return { isGenerating, lastError, setGenerating, setLastError };
}
