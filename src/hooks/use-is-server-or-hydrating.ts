// src/hooks/use-is-server-or-hydrating.ts
import { useSyncExternalStore } from "react";

// True while the HTML is made on the server and while React hydrates it; false for every render
// React does purely in the browser. The review pages use it to emit their pre-paint name script
// only in the server HTML (D309).
const noSubscribe = () => () => {};

export function useIsServerOrHydrating(): boolean {
  return useSyncExternalStore(noSubscribe, () => false, () => true);
}
