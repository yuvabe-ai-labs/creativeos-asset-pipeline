"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// D309: which Client review node's feedback the right-side drawer shows. Page-level — like
// ReviewDrawerProvider — because the header's "Client feedback" chip sits OUTSIDE the canvas
// store, while the node and the drawer sit inside it.
//
// `fly` asks the drawer (which lives inside React Flow) to bring the node into view: the
// header chip sets it, a click on the node itself does not (the node is already on screen).
type Ctx = {
  nodeId: string | null;
  fly: boolean;
  openFeedback: (nodeId: string, opts?: { fly?: boolean }) => void;
  closeFeedback: () => void;
  consumeFly: () => void;
};

const NOOP: Ctx = {
  nodeId: null,
  fly: false,
  openFeedback: () => {},
  closeFeedback: () => {},
  consumeFly: () => {},
};

const ClientFeedbackContext = createContext<Ctx | null>(null);

export function ClientFeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ nodeId: string | null; fly: boolean }>({
    nodeId: null,
    fly: false,
  });
  const openFeedback = useCallback(
    (nodeId: string, opts?: { fly?: boolean }) => setState({ nodeId, fly: !!opts?.fly }),
    [],
  );
  const closeFeedback = useCallback(() => setState({ nodeId: null, fly: false }), []);
  const consumeFly = useCallback(() => setState((s) => (s.fly ? { ...s, fly: false } : s)), []);
  const value = useMemo(
    () => ({ ...state, openFeedback, closeFeedback, consumeFly }),
    [state, openFeedback, closeFeedback, consumeFly],
  );
  return <ClientFeedbackContext.Provider value={value}>{children}</ClientFeedbackContext.Provider>;
}

/** Outside a provider (any page that renders canvas nodes without the header) it is inert. */
export function useClientFeedback(): Ctx {
  return useContext(ClientFeedbackContext) ?? NOOP;
}
