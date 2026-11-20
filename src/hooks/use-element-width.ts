"use client";

import { useCallback, useRef, useState } from "react";

/** An element's rendered width, kept current with a ResizeObserver. Attach the returned ref.
 *  When the element unmounts the last width is kept, not cleared: the ref often moves between
 *  two elements that swap (a player and its loading box), and clearing would let anything sized
 *  from it jump to full width for a frame before the next element is measured. */
export function useElementWidth<T extends HTMLElement>(): readonly [(el: T | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.current.observe(el);
  }, []);
  return [ref, width] as const;
}

/** An element's rendered height (border box), kept current with a ResizeObserver. Like
 *  useElementWidth, the last height is kept when the element unmounts. */
export function useElementHeight<T extends HTMLElement>(): readonly [(el: T | null) => void, number | null] {
  const [height, setHeight] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) =>
      setHeight(Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height)),
    );
    observer.current.observe(el);
  }, []);
  return [ref, height] as const;
}
