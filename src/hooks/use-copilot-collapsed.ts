"use client";

import { useCallback, useSyncExternalStore } from "react";

// Whether the Generate page's copilot is folded to a rail so the script gets the full width.
// Remembered per script in this browser only (a per-viewer convenience); a script never folded
// starts open. Storage can be blocked (a private window), so a copy in memory keeps the toggle
// working for the visit. The server renders it open; the browser then reads the saved choice
// (useSyncExternalStore), so a server-rendered page never mismatches on hydration.

const key = (scriptId: string) => `creativeos.scriptCopilot.collapsed.${scriptId}`;
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

export function readCopilotCollapsed(scriptId: string): boolean {
  try {
    const saved = localStorage.getItem(key(scriptId));
    if (saved !== null) return saved === "1";
  } catch {
    /* blocked storage: fall back to this visit's memory */
  }
  return memory.get(scriptId) ?? false;
}

export function writeCopilotCollapsed(scriptId: string, collapsed: boolean): void {
  memory.set(scriptId, collapsed);
  try {
    localStorage.setItem(key(scriptId), collapsed ? "1" : "0");
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

export function useCopilotCollapsed(scriptId: string) {
  const collapsed = useSyncExternalStore(subscribe, () => readCopilotCollapsed(scriptId), () => false);
  const setCollapsed = useCallback((next: boolean) => writeCopilotCollapsed(scriptId, next), [scriptId]);
  return [collapsed, setCollapsed] as const;
}
