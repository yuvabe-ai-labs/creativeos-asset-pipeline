"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

// Fires `onVisible` when it scrolls into view. `rootMargin` starts the fetch before the
// sentinel is actually on screen, so the next page is usually already there by the time
// the reviewer reaches the end — which is what makes it feel like one continuous list
// rather than a series of waits.
export function InfiniteScrollSentinel({
  onVisible,
  loading,
}: {
  onVisible: () => void;
  loading: boolean;
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
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cbRef.current();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex h-8 items-center justify-center">
      {loading && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" strokeWidth={1.5} />
      )}
    </div>
  );
}
