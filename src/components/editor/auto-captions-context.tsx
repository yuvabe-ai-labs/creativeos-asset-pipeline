"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAutoCaptions, type AutoCaptions } from "@/hooks/use-auto-captions";

export { failureCopy } from "@/hooks/use-auto-captions";

// One Auto captions run for the page (rule 1): the lane, the panel and the buttons all read it.
const AutoCaptionsContext = createContext<AutoCaptions | null>(null);

export function AutoCaptionsProvider({ canvasId, nodeId, children }: { canvasId: string; nodeId: string; children: ReactNode }) {
  const value = useAutoCaptions({ canvasId, nodeId });
  return <AutoCaptionsContext.Provider value={value}>{children}</AutoCaptionsContext.Provider>;
}

export function useAutoCaptionsContext(): AutoCaptions {
  const value = useContext(AutoCaptionsContext);
  if (!value) throw new Error("useAutoCaptionsContext must be used inside AutoCaptionsProvider");
  return value;
}
