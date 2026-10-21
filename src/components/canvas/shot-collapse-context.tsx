"use client";

import { createContext, useContext, type ReactNode } from "react";

// D387 — how many nodes each collapsed Shot is hiding, derived once for the whole canvas
// (useShotCollapse) so a Shot node reads its own count without walking the graph.
const ShotHiddenCountContext = createContext<ReadonlyMap<string, number>>(new Map());

export function ShotHiddenCountProvider({
  value,
  children,
}: {
  value: ReadonlyMap<string, number>;
  children: ReactNode;
}) {
  return (
    <ShotHiddenCountContext.Provider value={value}>{children}</ShotHiddenCountContext.Provider>
  );
}

export function useShotHiddenCount(shotId: string): number {
  return useContext(ShotHiddenCountContext).get(shotId) ?? 0;
}
