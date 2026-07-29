"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { ClientKBJobRow } from "@/lib/db/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useKBJobStatus(
  clientId: string,
  initialJob: ClientKBJobRow | null,
): ClientKBJobRow | null {
  const [job, setJob] = useState<ClientKBJobRow | null>(initialJob);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`kb-job:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_kb_jobs",
          filter: `client_id=eq.${clientId}`,
        },
        (payload: RealtimePostgresChangesPayload<ClientKBJobRow>) => {
          const next = payload.new as ClientKBJobRow | undefined;
          if (next) setJob(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  return job;
}
