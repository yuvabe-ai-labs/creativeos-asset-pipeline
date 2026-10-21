"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { COLLAPSED_SHOT_HANDLE } from "@/lib/canvas/shot-collapse";

// D387 — where lines rerouted into a collapsed Shot or Multishot arrive. Always rendered (so React
// Flow has measured it before any rerouted edge needs it) but only shown while collapsed; never
// connectable, since those lines are display-only.
export function CollapsedInHandle({ collapsed }: { collapsed: boolean }) {
  return (
    <Handle
      id={COLLAPSED_SHOT_HANDLE}
      type="target"
      position={Position.Top}
      isConnectable={false}
      className={cn("size-3! border-2! border-card! bg-muted-foreground!", !collapsed && "invisible")}
    />
  );
}
