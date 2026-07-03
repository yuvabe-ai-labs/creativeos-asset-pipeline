"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether the current session may mutate the canvas (holds the D33 lock). Defaults to
// true so any surface used outside a canvas (if any) is unaffected.
const CanvasEditableContext = createContext<boolean>(true);

export function CanvasEditableProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <CanvasEditableContext.Provider value={value}>{children}</CanvasEditableContext.Provider>
  );
}

export function useCanvasEditable(): boolean {
  return useContext(CanvasEditableContext);
}
