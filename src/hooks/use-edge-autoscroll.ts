"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

const EDGE_PX = 50;
const MAX_STEP_PX = 18;

/** While a drag is held near the scroll area's left or right edge, scroll it, and replay the last
 *  pointer move so whatever is dragged follows (D404). Call `move` on every pointer move, `stop`
 *  on release. */
export function useEdgeAutoscroll(scrollerRef: RefObject<HTMLDivElement | null>, onScrolled: (clientX: number) => void) {
  const state = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  const raf = useRef(0);
  const cb = useRef(onScrolled);
  const tick = useRef<() => void>(() => {});

  useEffect(() => {
    cb.current = onScrolled;
  }, [onScrolled]);

  useEffect(() => {
    const frame = () => {
      const el = scrollerRef.current;
      const s = state.current;
      if (!el || !s.active) return;
      const r = el.getBoundingClientRect();
      const step = s.x > r.right - EDGE_PX ? Math.min(MAX_STEP_PX, (s.x - (r.right - EDGE_PX)) / 3) : s.x < r.left + EDGE_PX ? -Math.min(MAX_STEP_PX, (r.left + EDGE_PX - s.x) / 3) : 0;
      if (step !== 0) {
        const before = el.scrollLeft;
        el.scrollLeft += step;
        if (el.scrollLeft !== before) cb.current(s.x);
      }
      raf.current = requestAnimationFrame(frame);
    };
    tick.current = frame;
    return () => cancelAnimationFrame(raf.current);
  }, [scrollerRef]);

  const move = useCallback((clientX: number) => {
    state.current.x = clientX;
    if (!state.current.active) {
      state.current.active = true;
      raf.current = requestAnimationFrame(() => tick.current());
    }
  }, []);

  const stop = useCallback(() => {
    state.current.active = false;
    cancelAnimationFrame(raf.current);
  }, []);

  return { move, stop };
}
