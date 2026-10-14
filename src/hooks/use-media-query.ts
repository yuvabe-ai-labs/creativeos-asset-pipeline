// src/hooks/use-media-query.ts
import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches. False on the server and while hydrating, so the first
 *  browser render matches the server's HTML. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
