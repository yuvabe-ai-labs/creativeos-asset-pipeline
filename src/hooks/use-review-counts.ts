"use client";

import { useEffect, useRef, useState } from "react";
import { useIdentity } from "./use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import type { ReviewCounts } from "@/lib/review/queue";

// Coalesces a burst of version writes (a batch duplicate, several generations landing at
// once) into one refetch instead of one per row.
const REFETCH_DEBOUNCE_MS = 400;

// R8.1: counts update live without a reload. Seeded from the server-rendered value, so the
// first paint is already correct and there is no flash of zero before the first fetch.
//
// R8.5 is the load-bearing part: on a failed refetch or a dropped connection this KEEPS
// THE LAST KNOWN COUNTS and never falls back to zero. A confidently wrong "nothing to
// review" is worse than a stale number, because it is indistinguishable from being
// finished — the user simply stops looking.
export function useReviewCounts(initial: ReviewCounts): ReviewCounts {
  const [counts, setCounts] = useState<ReviewCounts>(initial);
  const { orgId } = useIdentity();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed when the server sends a newer value (a navigation, or router.refresh()).
  // Adjusted DURING RENDER rather than in an effect: setState inside an effect triggers
  // the cascading re-render React 19 warns about, and the seed comparison is the pattern
  // this codebase already uses for the same problem (see the `seed.open !== open` block in
  // video-prompt-focus-view.tsx). The reference check is enough — `initial` comes from a
  // server component, so it only changes identity when the server actually re-rendered.
  const [seed, setSeed] = useState<ReviewCounts>(initial);
  if (seed !== initial) {
    setSeed(initial);
    setCounts(initial);
  }

  useEffect(() => {
    if (!orgId) return;

    const refetch = async () => {
      try {
        const res = await authFetch("/api/review/counts", { cache: "no-store" });
        if (!res.ok) return; // R8.5 — keep what we have
        setCounts((await res.json()) as ReviewCounts);
      } catch {
        // R8.5 — offline or mid-token-refresh. The next event will try again; showing a
        // stale count beats showing a confident zero.
      }
    };

    const unsubscribe = subscribeToOrgVersionUpdates(orgId, () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribe();
    };
  }, [orgId]);

  return counts;
}
