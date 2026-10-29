"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { createEditorStore, type EditorStoreState } from "@/lib/editor/editor-store";
import type { EditDoc, SourceView } from "@/lib/editor/types";

// One store per mounted editor, created once on first render (never at module scope), seeded
// from the server render.
const EditorStoreContext = createContext<StoreApi<EditorStoreState> | null>(null);

export function EditorStoreProvider({ doc, sources, children }: { doc: EditDoc; sources: SourceView[]; children: ReactNode }) {
  const [store] = useState(() => createEditorStore({ doc, sources }));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStoreApi(): StoreApi<EditorStoreState> {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used inside EditorStoreProvider");
  return store;
}

export function useEditorStore<T>(selector: (s: EditorStoreState) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
