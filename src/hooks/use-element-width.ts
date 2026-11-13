"use client";

import { useCallback, useRef, useState } from "react";

/** An element's rendered width, kept current with a ResizeObserver. Attach the returned ref. */
export function useElementWidth<T extends HTMLElement>(): readonly [(el: T | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setWidth(null);
      return;
    }
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.current.observe(el);
  }, []);
  return [ref, width] as const;
}
