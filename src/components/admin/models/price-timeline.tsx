"use client";

import { cancelAiModelPriceAction, undoAiModelPriceAction } from "@/lib/actions/ai-models";
import type { PriceTimeline as Timeline } from "@/lib/admin/price-sheet";
import { ChangeTimeline } from "@/components/admin/change-timeline";

/** "Price history": every price row, newest first, with Cancel on a scheduled change and Undo on a fresh one. */
export function PriceTimeline({ modelId, timeline }: { modelId: string; timeline: Timeline }) {
  return (
    <ChangeTimeline
      timeline={timeline}
      actions={{
        cancel: (item) => cancelAiModelPriceAction(item.id, modelId),
        undo: (item) => undoAiModelPriceAction(modelId, item.id),
        cancelledMessage: (item) => `Cancelled ${item.name}.`,
        undoneMessage: "Undone. The earlier prices are live again.",
        cancelDetail: "It hasn't started, so no run used it.",
        undoDetail: "The prices before it go live again now. Runs already charged keep their price.",
        empty: "No prices yet.",
      }}
    />
  );
}
