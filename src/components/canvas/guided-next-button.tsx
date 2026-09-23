"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { GUIDED_CHAIN, planGuidedNext } from "@/lib/guided-flow";

// Guided next-node CTA (D36). Creates → connects → places → opens the next pipeline
// node — never runs a model. Idempotent: navigates to an existing next instead of
// duplicating. Rendered as a card chip (Shot) or a focus-view header button (others) —
// a primary-tinted outline, not solid: it's navigation, so the view's own Generate CTA
// stays the one primary, but as a guided "add" action it must stay discoverable, so it
// borrows the chip's border-primary/40 + text-primary treatment instead of neutral gray.
export function GuidedNextButton({
  sourceId,
  variant,
  onNavigate,
  /**
   * D280 — a gate to run BEFORE navigating. Called in place of the whole click when provided,
   * and handed a `proceed` callback that performs the actual navigation (create → connect →
   * place → open). It gates before `guidedCreateNext`: creating the node and its edges is the
   * side effect a confirm exists to gate, so a confirm that ran after it would be confirming
   * something already done. The caller decides whether/when to call `proceed` — e.g. from a
   * confirm dialog's own onConfirm — instead of re-invoking the click path itself.
   */
  onBeforeNavigate,
}: {
  sourceId: string;
  variant: "chip" | "button";
  onNavigate?: () => void;
  onBeforeNavigate?: (proceed: () => void) => void;
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

  // Opens immediately — guidedCreateNext writes the node and its edges into the client store
  // only, and the focus view resolves its inputs SERVER-side from persisted edges. Rather than
  // hold the click for that save, each focus view flushes autosave itself on open and keeps its
  // skeleton up until the flush and the fetch behind it have both landed.
  const proceed = () => {
    const id = guidedCreateNext(sourceId);
    if (!id) return;
    onNavigate?.();          // close the current focus view (if any)
    setFocusedNodeId(id);    // open the next node's focus view (D35 seam)
  };

  const handleClick = () => {
    // The gate runs BEFORE guidedCreateNext: creating the node and its edges is the side effect
    // a confirm exists to gate, so a confirm that ran after it would be confirming something
    // already done. The gate calls `proceed` itself once the operator accepts.
    if (onBeforeNavigate) {
      onBeforeNavigate(proceed);
      return;
    }
    proceed();
  };

  if (variant === "chip") {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={handleClick}
        disabled={disabled}
        title={plan.gate.nudge}
        className={cn(
          "nodrag h-auto gap-1 rounded-md border-dashed border-primary/40 px-2 py-1 text-[0.65rem] font-normal text-primary hover:bg-primary/5 hover:text-primary",
          disabled && "disabled:pointer-events-auto cursor-not-allowed opacity-50",
        )}
      >
        <ArrowRight className="size-3" strokeWidth={1.5} /> {label}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      title={plan.gate.nudge}
      className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
    >
      {label} <ArrowRight className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
