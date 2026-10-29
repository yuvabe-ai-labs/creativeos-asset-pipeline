"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { markLockHandoff } from "@/lib/canvas/lock-session";

/**
 * Navigates between a canvas and its editor without dropping the lock (D391): saves what the
 * page being left still holds, marks the handoff, then moves. Neither page flushes on unmount,
 * so the flush is awaited first.
 */
export function useLockHandoffNavigation(canvasId: string) {
  const router = useRouter();
  return useCallback(
    async (href: string, flush: () => Promise<unknown>) => {
      await flush();
      markLockHandoff(canvasId);
      router.push(href);
    },
    [canvasId, router],
  );
}
