"use client";

import { formatIstDate, formatIstWhen } from "@/lib/admin/ist";
import { diffSummary } from "@/lib/admin/price-sheet";
import type { AiModelPrice } from "@/lib/ai-models/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChoiceCards } from "./choice-cards";
import type { FlowBase } from "./use-change-prices";

/** With a change scheduled, Change prices first asks which prices to start from: that change (the default) or today's. */
export function ChooserDialog({
  open,
  pick,
  current,
  next,
  provider,
  returnFocus,
  onPick,
  onContinue,
  onCancel,
}: {
  open: boolean;
  pick: FlowBase;
  current: AiModelPrice | null;
  next: AiModelPrice;
  provider: string;
  /** Where focus goes when the dialog closes; false leaves it to the grid. */
  returnFocus: () => HTMLElement | null | false;
  onPick: (pick: FlowBase) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const at = new Date(next.effectiveFrom);
  const note = next.note ? ` ${next.note.replace(/\.?$/, ".")}` : "";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="gap-5 p-6 sm:max-w-xl" finalFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold tracking-tight">Which prices do you want to change?</DialogTitle>
        </DialogHeader>
        <ChoiceCards
          label="Which prices"
          value={pick}
          onChange={onPick}
          choices={[
            {
              value: "next",
              title: `Edit the change starting ${formatIstDate(at, false)}`,
              detail: `${diffSummary(current, next, provider)}, from ${formatIstWhen(at)}.${note} Saving keeps that start time.`,
            },
            { value: "live", title: "Start a new change from today's prices", detail: "Starts from what's live now. You pick when it starts; Now is the default." },
          ]}
        />
        <DialogFooter className="-mx-6 -mb-6 px-6 sm:justify-between">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
