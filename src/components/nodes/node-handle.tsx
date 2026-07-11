import { cn } from "@/lib/utils";
import { nodeHandle } from "@/lib/nodes/describe-node";

// The node's stable ref tag ("PRM-A3F9"), shown on its card face so a human can refer
// to a specific node by handle. Rendered in the design system's tracked small-caps
// eyebrow style so it reads as an intentional identifier, not a debug string.
export function NodeHandle({
  nodeId,
  nodeType,
  className,
}: {
  nodeId: string;
  nodeType?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("text-eyebrow text-[10px] text-muted-foreground", className)}
      title="Node reference"
    >
      {nodeHandle({ id: nodeId, type: nodeType })}
    </span>
  );
}
