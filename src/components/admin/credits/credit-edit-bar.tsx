"use client";

import { Button } from "@/components/ui/button";
import { FlowStepper } from "@/components/admin/models/change-prices/flow-stepper";

export const CREDIT_STEPS = ["Settings", "When", "Review"] as const;

/** Above the settings while changing them: the steps, what changes so far, Cancel and Next. */
export function CreditEditBar({
  summary,
  invalid,
  canGoOn,
  onCancel,
  onNext,
}: {
  /** "Margin 0% → 10%, Step 5 → 10"; empty when nothing changes yet. */
  summary: string | null;
  invalid: boolean;
  canGoOn: boolean;
  onCancel: () => void;
  onNext: () => void;
}) {
  return (
    <section aria-label="Change credit settings" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-card md:px-5">
      <FlowStepper at={1} steps={CREDIT_STEPS} />
      <span className="flex-1" />
      <span aria-live="polite" className="text-[0.8125rem]">
        {invalid ? (
          <span className="text-destructive-text">Margin needs a fix</span>
        ) : summary ? (
          <span className="font-semibold text-primary">{summary}</span>
        ) : (
          <span className="text-muted-foreground">No changes yet</span>
        )}
      </span>
      <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      <Button id="credits-next" size="sm" disabled={!canGoOn} onClick={onNext}>Next: when</Button>
    </section>
  );
}
