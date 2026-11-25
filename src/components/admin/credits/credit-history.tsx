"use client";

import { cancelCreditSettingsAction, undoCreditSettingsAction } from "@/lib/actions/credit-settings";
import { LEAD_MINUTES, creditUndoneMessage } from "@/lib/admin/credits-change";
import type { PriceTimeline as Timeline } from "@/lib/admin/price-sheet";
import { ChangeTimeline } from "@/components/admin/change-timeline";

/** The credit settings history, in the price history's look: Cancel on a scheduled change, Undo on a fresh one, as the server allows. */
export function CreditHistory({
  timeline,
  kept,
}: {
  timeline: Timeline;
  /** By scheduled change: the settings runs keep if it is cancelled. */
  kept: Record<string, string>;
}) {
  return (
    <ChangeTimeline
      timeline={timeline}
      actions={{
        cancel: (item) => cancelCreditSettingsAction(item.id),
        undo: async (item) => {
          const r = await undoCreditSettingsAction(item.id);
          return r.error || !r.effectiveFrom ? { error: r.error } : { done: creditUndoneMessage(new Date(r.effectiveFrom)) };
        },
        cancelledMessage: (item) => `Cancelled ${item.name}.${kept[item.id] ? ` ${kept[item.id]}` : ""}`,
        undoneMessage: `Undone. The earlier settings come back in ${LEAD_MINUTES} minutes.`,
        cancelDetail: (item) => `It hasn't started, so no run used it.${kept[item.id] ? ` ${kept[item.id]}` : ""}`,
        undoDetail: `The settings before it come back in ${LEAD_MINUTES} minutes. Runs already charged keep their credits.`,
        empty: "No settings yet.",
      }}
    />
  );
}
