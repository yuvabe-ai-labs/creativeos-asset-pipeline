"use client";

import { createContext, useContext, type ReactNode } from "react";

// The open editor's identity on the server (D408): its canvas, its Editor node, the canvas-lock
// session it holds, and how to save what's pending before a canvas change.
export type EditorSession = { canvasId: string; editorNodeId: string; sessionId: string; flush(): Promise<void> };

const SessionContext = createContext<EditorSession | null>(null);

export function EditorSessionProvider({ value, children }: { value: EditorSession; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useEditorSession(): EditorSession {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useEditorSession must be used inside EditorSessionProvider");
  return v;
}
