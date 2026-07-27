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
  // Font-size tier by zoom — larger when zoomed out so the tag stays legible at
  // overview zoom. Three tiers, each 2× the previous sizes. The selector returns a
  // discrete tier (not the raw zoom), so a node re-renders only when its tier
  // crosses a threshold — not on every zoom tick (React Flow contextual-zoom pattern).
  const tier = useStore((s) => {
    const zoom = s.transform[2];
    if (zoom < 0.4) return 2; // most zoomed out
    if (zoom < 0.65) return 1;
    return 0; // working zoom
  });
  return (
    <span
      className={cn(
        "text-eyebrow whitespace-nowrap font-medium",
        tier === 2
          ? "text-[28px] text-foreground"
          : tier === 1
            ? "text-[24px] text-foreground"
            : "text-[20px] text-foreground/70",
        className,
      )}
      title="Node reference"
    >
      {nodeHandle({ id: nodeId, type: nodeType })}
    </span>
  );
}
