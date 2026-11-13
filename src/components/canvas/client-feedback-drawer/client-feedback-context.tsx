"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// D309 / D498: a request to open a Client review node's focus view. Page-level — like
// ReviewDrawerProvider — because the header's "Client feedback" chip sits OUTSIDE the canvas
// store, while the node sits inside it. The node consumes the request (closeFeedback) once it
// has opened.
//
// `fly` asks the node (inside React Flow) to bring itself into view first: the header chip and
// the add menu's "Open Client review" set it. `versionNo` (D500) opens the focus view on that
// version; without it the view shows the one it showed last (newest at first).
export type FeedbackRequest = { nodeId: string; fly: boolean; versionNo: number | null };

type Ctx = {
  /** A new object per call, so asking for the same node twice is still a new request. */
  request: FeedbackRequest | null;
  openFeedback: (nodeId: string, opts?: { fly?: boolean; versionNo?: number }) => void;
  closeFeedback: () => void;
};

const NOOP: Ctx = {
  request: null,
  openFeedback: () => {},
  closeFeedback: () => {},
};

const ClientFeedbackContext = createContext<Ctx | null>(null);

export function ClientFeedbackProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<FeedbackRequest | null>(null);
  const openFeedback = useCallback(
    (nodeId: string, opts?: { fly?: boolean; versionNo?: number }) =>
      setRequest({ nodeId, fly: !!opts?.fly, versionNo: opts?.versionNo ?? null }),
    [],
  );
  const closeFeedback = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ request, openFeedback, closeFeedback }), [request, openFeedback, closeFeedback]);
  return <ClientFeedbackContext.Provider value={value}>{children}</ClientFeedbackContext.Provider>;
}

/** Outside a provider (any page that renders canvas nodes without the header) it is inert. */
export function useClientFeedback(): Ctx {
  return useContext(ClientFeedbackContext) ?? NOOP;
}
