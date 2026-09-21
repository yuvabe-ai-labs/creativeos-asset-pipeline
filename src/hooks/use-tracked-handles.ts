"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase/session-ready";

export type TrackedHandle = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  added_at: string;
};

/** The Performance tab's enrolment list (D252). Nothing here reads Brand Kit —
 *  `tracked_handles` is the only source of what we scrape. */
export function useTrackedHandles(clientId: string) {
  const [handles, setHandles] = useState<TrackedHandle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/performance/handles`);
    if (res.ok) setHandles(((await res.json()) as { handles: TrackedHandle[] }).handles);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Returns the canonical handle on success, or an error message to show inline. */
  const add = useCallback(
    async (raw: string): Promise<{ handle: string } | { error: string }> => {
      const res = await authFetch(`/api/clients/${clientId}/performance/handles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: raw }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return { error: body?.error ?? "Could not add that handle." };
      }
      const { handle } = (await res.json()) as { handle: TrackedHandle };
      await load();
      return { handle: handle.handle };
    },
    [clientId, load],
  );

  const remove = useCallback(
    async (handle: string) => {
      const res = await authFetch(
        `/api/clients/${clientId}/performance/handles/${encodeURIComponent(handle)}`,
        { method: "DELETE" },
      );
      if (res.ok) await load();
    },
    [clientId, load],
  );

  return { handles, loading, add, remove };
}
