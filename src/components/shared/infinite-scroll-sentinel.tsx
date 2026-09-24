"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

// Fires `onVisible` when it scrolls into view. `rootMargin` starts the fetch before the
// sentinel is actually on screen, so the next page is usually already there by the time
// the user reaches the end — which is what makes it feel like one continuous list
// rather than a series of waits.
export function InfiniteScrollSentinel({
  onVisible,
  loading,
  scrollRoot = "viewport",
}: {
  onVisible: () => void;
  loading: boolean;
  /**
   * Review fix — `rootMargin` is relative to the observer's `root`, not the page. "viewport"
   * (default, unchanged behavior for existing consumers) leaves `root` unset, so the 200px margin
   * is measured against the browser viewport. "nearest" targets the closest `ScrollArea` viewport
   * (`[data-slot="scroll-area-viewport"]`, see src/components/ui/scroll-area.tsx) so the margin —
   * and thus the early prefetch — is measured against that scrollable region instead, which matters
   * when the list scrolls inside a small fixed-height container (e.g. a popover) rather than the page.
   */
  scrollRoot?: "viewport" | "nearest";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Held in a ref so changing the callback identity does not tear down the observer on
  // every render. Synced in an effect, not during render — same pattern canvas.tsx uses
  // for canEditRef.
  const cbRef = useRef(onVisible);
  useLayoutEffect(() => {
    cbRef.current = onVisible;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = scrollRoot === "nearest" ? el.closest('[data-slot="scroll-area-viewport"]') : null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cbRef.current();
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  return (
    <div ref={ref} className="flex h-8 items-center justify-center">
      {loading && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" strokeWidth={1.5} />
      )}
    </div>
  );
}
