"use client";

import { CalendarDays, Info } from "lucide-react";
import { formatIstWhen } from "@/lib/admin/ist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BulkPercentBar } from "./bulk-percent-bar";
import { FlowStepper } from "./flow-stepper";
import type { FlowState } from "./use-change-prices";

/** Above the grid while editing: the steps, Cancel and Next, "Change every price by", and which prices the grid started from. */
export function EditBar({
  flow,
  canGoOn,
  hasOtherCharges,
  scheduledAt,
  onCancel,
  onNext,
  onBulkText,
  onIncludeOther,
  onBulkApply,
  onChooseAgain,
}: {
  flow: FlowState;
  canGoOn: boolean;
  hasOtherCharges: boolean;
  /** The scheduled change's start, when there is one. */
  scheduledAt: Date | null;
  onCancel: () => void;
  onNext: () => void;
  onBulkText: (text: string) => void;
  onIncludeOther: (on: boolean) => void;
  onBulkApply: () => void;
  onChooseAgain: () => void;
}) {
  return (
    <section aria-label="Change prices" className="mb-5 flex flex-col gap-3.5 rounded-xl border bg-card px-4 py-3.5 shadow-card md:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <FlowStepper at={1} />
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button id="change-prices-next" size="sm" disabled={!canGoOn} onClick={onNext}>Next: when</Button>
      </div>
      <div className="border-t pt-3.5">
        <BulkPercentBar
          value={flow.bulk}
          includeOther={flow.includeOther}
          hasOtherCharges={hasOtherCharges}
          onValue={onBulkText}
          onIncludeOther={onIncludeOther}
          onApply={onBulkApply}
        />
      </div>
      {flow.bulkMessage && (
        <p role="status" className={cn("flex items-center gap-2 text-[0.8125rem]", flow.bulkMessage.tone === "error" ? "text-destructive-text" : "text-foreground/80")}>
          <Info aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
          {flow.bulkMessage.text}
        </p>
      )}
      {scheduledAt && (
        <p className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-foreground/80">
          <CalendarDays aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0 text-primary" />
          {flow.base === "next"
            ? `Editing the change starting ${formatIstWhen(scheduledAt)}.`
            : `Starting from today's prices. A change is scheduled for ${formatIstWhen(scheduledAt)}.`}
          <Button variant="link" size="xs" className="h-auto px-0" onClick={onChooseAgain}>Choose again</Button>
        </p>
      )}
    </section>
  );
}
