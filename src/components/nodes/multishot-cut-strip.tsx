"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { EditableField } from "./editable-field";
import {
  MIN_CUT_SECONDS,
  maxSecondsFor,
  removeCut,
  resizeCut,
  totalOf,
  type MultishotCut,
} from "@/lib/nodes/multishot-cuts";

/**
 * The cut list as a proportional strip (D209).
 *
 * Cards are sized by their share of the budget, so a bad rhythm is visible before it is
 * generated. Each slider resizes ONE cut and its neighbour funds the change — the total is fixed,
 * because the Omni request's duration is derived from it and a ladder that outruns the duration
 * comes back truncated at full price.
 */
export function MultishotCutStrip({
  cuts,
  onChange,
  readOnly = false,
}: {
  cuts: MultishotCut[];
  onChange: (next: MultishotCut[]) => void;
  readOnly?: boolean;
}) {
  const editable = useCanvasEditable();
  const isReadOnly = readOnly || !editable; // D33: strict read-only under the lock
  const total = totalOf(cuts) || 1;

  return (
    <div className="nodrag flex gap-1.5">
      {cuts.map((cut, i) => (
        <div
          key={cut.id}
          style={{ flexGrow: cut.seconds, flexBasis: 0 }}
          className="group/cut min-w-0 rounded-md border border-border bg-background p-1.5"
        >
          <div className="flex items-start gap-1">
            <span className="text-[0.6rem] font-medium text-muted-foreground">{i + 1}</span>
            {!isReadOnly && cuts.length > 1 && (
              <Button
                variant="ghost"
                aria-label={`Remove cut ${i + 1}`}
                onClick={() => onChange(removeCut(cuts, i))}
                className="ml-auto h-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/cut:opacity-100 hover:bg-muted hover:text-foreground dark:hover:bg-muted"
              >
                <X className="size-3" strokeWidth={1.5} />
              </Button>
            )}
          </div>
          {/* Inline-editable, with the dotted-underline hover affordance the design system
              specifies for editable text — a cut's wording is authored here, not just displayed. */}
          <EditableField
            value={cut.text}
            onCommit={(text) => onChange(cuts.map((c, j) => (j === i ? { ...c, text } : c)))}
            readOnly={isReadOnly}
            multiline
            placeholder="Describe this cut…"
            className="text-[0.65rem] leading-snug"
          />
          <Slider
            value={[cut.seconds]}
            min={MIN_CUT_SECONDS}
            max={maxSecondsFor(cuts, i)}
            step={1}
            disabled={isReadOnly || cuts.length < 2}
            aria-label={`Cut ${i + 1} length in seconds`}
            onValueChange={(v) => onChange(resizeCut(cuts, i, Array.isArray(v) ? v[0] : v))}
            className="mt-1.5"
          />
          <span className={cn("text-[0.6rem] tabular-nums text-muted-foreground")}>
            {cut.seconds}s
          </span>
        </div>
      ))}
    </div>
  );
}
