"use client";

import { cancelCreditSettingsAction, undoCreditSettingsAction } from "@/lib/actions/credit-settings";
import { creditUndoneMessage } from "@/lib/admin/credits-change";
import type { PriceTimeline as Timeline } from "@/lib/admin/price-sheet";
import { ChangeTimeline } from "@/components/admin/change-timeline";

/** The credit settings history, in the price history's look: Cancel on a scheduled change, Undo on a fresh one, as the server allows. */
export function CreditHistory({ timeline }: { timeline: Timeline }) {
  return (
    <ChangeTimeline
      timeline={timeline}
      actions={{
        cancel: (item) => cancelCreditSettingsAction(item.id),
        undo: async (item) => {
          const r = await undoCreditSettingsAction(item.id);
          return r.error || !r.effectiveFrom ? { error: r.error } : { done: creditUndoneMessage(new Date(r.effectiveFrom)) };
        },
        cancelledMessage: (item) => `Cancelled ${item.name}. Today's settings stay.`,
        undoneMessage: "Undone. The earlier settings come back in 2 minutes.",
        cancelDetail: "It hasn't started, so no run used it. Today's settings stay.",
        undoDetail: "The settings before it come back in 2 minutes. Runs already charged keep their credits.",
        empty: "No settings yet.",
      }}
    />
  );
}
