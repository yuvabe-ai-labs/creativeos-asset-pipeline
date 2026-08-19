"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Single-line text that ellipsizes when it runs out of room and reveals the full
 * string in a tooltip ONLY while it is actually clipped — a tooltip repeating text
 * the reader can already see is noise, so overflow is measured rather than assumed.
 *
 * Callers must give this a `min-w-0` ancestor chain: a flex item defaults to
 * `min-width: auto`, which refuses to shrink below its content, so without it the
 * text shoves its siblings out of the row instead of clipping.
 */
export function TruncatedText({
  children,
  className,
  tooltip,
}: {
  children: string;
  className?: string;
  /** Overrides the tooltip body; defaults to the rendered text. */
  tooltip?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  // Re-measured on resize, not just on mount: the column width moves with the
  // viewport, so "does this name fit" is not answerable once at first paint.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  if (!clipped) {
    return (
      <span ref={ref} className={cn("block truncate", className)}>
        {children}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span ref={ref} className={cn("block truncate", className)} />}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{tooltip ?? children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
