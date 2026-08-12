"use client";

import { useCallback, useEffect, useRef } from "react";
import { createDebounced } from "@/lib/debounce";

// Thin React wrapper over the pure createDebounced factory (Task 1) — always calls the LATEST
// callback (via a ref updated every render, same always-current pattern use-post-editor.ts's
// onChangeRef already established), and flushes any pending call on unmount so an in-flight edit
// isn't lost if the focus view closes right after a keystroke.
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const debouncedRef = useRef<ReturnType<typeof createDebounced<A>> | null>(null);
  if (!debouncedRef.current) {
    debouncedRef.current = createDebounced<A>((...args) => fnRef.current(...args), delayMs);
  }

  useEffect(() => {
    const debounced = debouncedRef.current;
    return () => debounced?.flush();
  }, []);

  return useCallback((...args: A) => debouncedRef.current?.call(...args), []);
}
