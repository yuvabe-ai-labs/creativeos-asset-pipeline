"use client";

import { useShotHiddenCount } from "@/components/canvas/shot-collapse-context";

// D387 — "5 hidden" on a collapsed Shot or Multishot, so it's clear there is more inside.
export function HiddenCountNote({ nodeId, collapsed }: { nodeId: string; collapsed: boolean }) {
  const count = useShotHiddenCount(nodeId);
  if (!collapsed || count === 0) return null;
  return <span className="ml-auto text-[0.6rem] text-muted-foreground">{count} hidden</span>;
}
