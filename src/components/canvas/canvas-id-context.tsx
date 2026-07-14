"use client";

import { createContext, useContext, type ReactNode } from "react";

// Provides the current canvas ID to any component in the canvas tree
// (mirrors the canvas-editable-context.tsx pattern).
const CanvasIdContext = createContext<string>("");

export function CanvasIdProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <CanvasIdContext.Provider value={value}>{children}</CanvasIdContext.Provider>
  );
}

export function useCanvasId(): string {
  return useContext(CanvasIdContext);
}
