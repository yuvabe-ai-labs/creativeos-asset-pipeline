"use client";

import { useStore } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { nodeHandle } from "@/lib/nodes/describe-node";

// The node's stable ref tag ("PRM-A3F9"), shown on its card face so a human can refer
// to a specific node by handle. Rendered in the design system's tracked small-caps
// eyebrow style so it reads as an intentional identifier, not a debug string.
//
// Canvas-only (every consumer is a node card inside the ReactFlow provider): below
// the zoom threshold the tag flips larger so handles stay readable at overview zoom.
// The selector returns a BOOLEAN, so nodes re-render only when the zoom crosses the
// threshold — not on every zoom tick (React Flow contextual-zoom pattern).
export function NodeHandle({
  nodeId,
  nodeType,
  className,
}: {
  nodeId: string;
  nodeType?: string;
  className?: string;
}) {
  const zoomedOut = useStore((s) => s.transform[2] < 0.65);
  return (
    <span
      className={cn(
        "text-eyebrow whitespace-nowrap font-medium",
        zoomedOut ? "text-[15px] text-foreground" : "text-[10px] text-foreground/70",
        className,
      )}
      title="Node reference"
    >
      {nodeHandle({ id: nodeId, type: nodeType })}
    </span>
  );
}
