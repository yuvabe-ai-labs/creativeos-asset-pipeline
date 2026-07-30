"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";

type FlushFn = () => Promise<void>;

const AutosaveFlushContext = createContext<{
  register: (fn: FlushFn) => void;
  flush: FlushFn;
} | null>(null);

export function AutosaveFlushProvider({ children }: { children: ReactNode }) {
  const flushRef = useRef<FlushFn>(async () => {
    // Default no-op — safe if flush is called before autosave has registered.
  });

  const value = useRef({
    register: (fn: FlushFn) => {
      flushRef.current = fn;
    },
    flush: async () => {
      await flushRef.current();
    },
  }).current;

  return (
    <AutosaveFlushContext.Provider value={value}>
      {children}
    </AutosaveFlushContext.Provider>
  );
}

export function useRegisterAutosaveFlush(): (fn: FlushFn) => void {
  const ctx = useContext(AutosaveFlushContext);
  if (!ctx) throw new Error("useRegisterAutosaveFlush must be used inside AutosaveFlushProvider");
  return ctx.register;
}

export function useFlushAutosave(): FlushFn {
  const ctx = useContext(AutosaveFlushContext);
  // No-op when outside the provider (e.g., in isolated tests / storybook).
  return ctx?.flush ?? (async () => {});
}
