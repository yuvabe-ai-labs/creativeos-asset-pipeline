"use client";

import { useCallback, useSyncExternalStore } from "react";

// A yes/no remembered in this browser only: a per-viewer convenience (a folded panel, a developer
// switch). Storage can be blocked (a private window), so a copy in memory keeps it working for the
// visit. The server renders the fallback; the browser then reads the saved value
// (useSyncExternalStore), so a server-rendered page never mismatches on hydration.

const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

export function readStoredFlag(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved === "1";
  } catch {
    /* blocked storage: fall back to this visit's memory */
  }
  return memory.get(key) ?? fallback;
}

export function writeStoredFlag(key: string, value: boolean): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* blocked storage: memory alone carries it */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useStoredFlag(key: string, fallback: boolean) {
  const value = useSyncExternalStore(subscribe, () => readStoredFlag(key, fallback), () => fallback);
  const setValue = useCallback((next: boolean) => writeStoredFlag(key, next), [key]);
  return [value, setValue] as const;
}
