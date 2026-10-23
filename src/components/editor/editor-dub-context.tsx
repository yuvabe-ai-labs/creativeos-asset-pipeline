"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useEditorDub, type EditorDub } from "@/hooks/use-editor-dub";

// One dub poller for the page (rule 1): the Dub tab, the Dub lane and the clip menu all read it.
const DubContext = createContext<EditorDub | null>(null);

export function EditorDubProvider({ children }: { children: ReactNode }) {
  const value = useEditorDub();
  return <DubContext.Provider value={value}>{children}</DubContext.Provider>;
}

export function useEditorDubContext(): EditorDub {
  const v = useContext(DubContext);
  if (!v) throw new Error("useEditorDubContext must be used inside EditorDubProvider");
  return v;
}
