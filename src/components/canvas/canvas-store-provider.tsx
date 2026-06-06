"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createCanvasStore,
  type CanvasState,
  type CanvasStore,
} from "@/lib/canvas-store";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Edge } from "@xyflow/react";

// Store-provider pattern: the store is created in a ref on first render (never
// at module scope), so Next.js server rendering can't share one store across
// requests, and each mounted canvas gets a fresh instance — seeded with the
// nodes and edges loaded from the DB on the server.
const CanvasStoreContext = createContext<CanvasStore | null>(null);

export function CanvasStoreProvider({
  initialNodes = [],
  initialEdges = [],
  children,
}: {
  initialNodes?: AppNode[];
  initialEdges?: Edge[];
  children: ReactNode;
}) {
  const storeRef = useRef<CanvasStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createCanvasStore(initialNodes, initialEdges);
  }
  return (
    <CanvasStoreContext.Provider value={storeRef.current}>
      {children}
    </CanvasStoreContext.Provider>
  );
}

export function useCanvasStore<T>(selector: (state: CanvasState) => T): T {
  const store = useContext(CanvasStoreContext);
  if (!store) {
    throw new Error("useCanvasStore must be used within <CanvasStoreProvider>");
  }
  return useStore(store, selector);
}
