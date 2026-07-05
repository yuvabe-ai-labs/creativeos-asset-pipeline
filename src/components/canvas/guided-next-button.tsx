"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { GUIDED_CHAIN, planGuidedNext } from "@/lib/guided-flow";

// Guided next-node CTA (D36). Creates → connects → places → opens the next pipeline
// node — never runs a model. Idempotent: navigates to an existing next instead of
// duplicating. Rendered as a card chip (Shot) or a focus-view primary button (others).
export function GuidedNextButton({
  sourceId,
  variant,
  onNavigate,
}: {
  sourceId: string;
  variant: "chip" | "button";
  onNavigate?: () => void;
}) {
  const editable = useCanvasEditable();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const guidedCreateNext = useCanvasStore((s) => s.guidedCreateNext);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  const source = nodes.find((n) => n.id === sourceId);
  const step = source ? GUIDED_CHAIN[source.type as string] : undefined;
  if (!editable || !source || !step) return null;

  const plan = planGuidedNext(source, nodes, edges); // pure — safe in render
  if (!plan) return null;

  const label = plan.existingId ? step.openLabel : step.createLabel;
  const disabled = !plan.gate.enabled;

  const handleClick = () => {
    const id = guidedCreateNext(sourceId);
    if (!id) return;
    onNavigate?.();          // close the current focus view (if any)
    setFocusedNodeId(id);    // open the next node's focus view (D35 seam)
  };

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={plan.gate.nudge}
        className={cn(
          "nodrag mt-1 flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary transition-colors hover:bg-primary/5",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <ArrowRight className="size-3" strokeWidth={1.5} /> {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleClick} disabled={disabled}>
        {label} <ArrowRight className="size-4" strokeWidth={1.5} />
      </Button>
      {plan.gate.nudge && (
        <span className="text-[0.7rem] text-muted-foreground">{plan.gate.nudge}</span>
      )}
    </div>
  );
}
