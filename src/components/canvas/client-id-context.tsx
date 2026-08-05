"use client";

import { createContext, useContext, type ReactNode } from "react";

// Provides the current client ID to any component in the canvas tree (mirrors
// canvas-id-context.tsx). The Post editor's Brand panel is client-scoped, and
// prop-drilling would thread the value through five components that have no interest in
// it — Canvas -> nodes -> PostNode -> PostFocusView -> panel (D134).
const ClientIdContext = createContext<string>("");

export function ClientIdProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <ClientIdContext.Provider value={value}>{children}</ClientIdContext.Provider>
  );
}

export function useClientId(): string {
  return useContext(ClientIdContext);
}
