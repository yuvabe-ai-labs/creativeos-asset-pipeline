"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addAiModelPriceAction,
  cancelAiModelPriceAction,
  replaceAiModelPriceAction,
  undoAiModelPriceAction,
} from "@/lib/actions/ai-models";
import { keepsNote, replacedRow, savedMessage, undoPlan, whenInstant, type When } from "@/lib/admin/change-prices";
import type { AiModelPrice, PriceLine } from "@/lib/ai-models/types";

const SAVE_ERROR = "Could not save. Try again.";
const UNDONE = "Undone. Prices are back as they were.";

type SaveInput = {
  modelId: string;
  label: string;
  /** This model's price rows that pass their check. */
  prices: readonly AiModelPrice[];
  base: AiModelPrice;
  lines: PriceLine[];
  when: When;
};

/**
 * Saves new prices: a replace (one transaction) when they start on the IST day of a scheduled
 * change, otherwise a new row. The toast says the start the server gave and offers Undo where the
 * server would take it back; the page data is read again either way.
 */
export function useSavePrices() {
  const router = useRouter();

  async function undo(plan: NonNullable<ReturnType<typeof undoPlan>>, modelId: string, id: string, replaced: AiModelPrice | null) {
    let error: string | undefined;
    try {
      if (plan === "cancel") error = (await cancelAiModelPriceAction(id, modelId)).error;
      else if (plan === "undo") error = (await undoAiModelPriceAction(modelId, id)).error;
      else if (replaced) {
        // Puts the replaced change back as it was, in place of the new row.
        error = (
          await replaceAiModelPriceAction({
            replaceId: id,
            modelId,
            effectiveFrom: replaced.effectiveFrom,
            lines: replaced.lines,
            estimate: replaced.estimate,
            sourceUrl: replaced.sourceUrl ?? undefined,
            note: replaced.note ?? undefined,
          })
        ).error;
      }
    } catch {
      error = SAVE_ERROR;
    }
    router.refresh();
    if (error) toast.error(error);
    else toast.success(UNDONE);
  }

  /** True when saved. */
  return async function save(input: SaveInput): Promise<boolean> {
    const now = new Date();
    const requested = whenInstant(input.when, now);
    if (!requested) return false;
    const replaced = replacedRow(input.prices, input.when, now);
    const row = {
      modelId: input.modelId,
      effectiveFrom: requested.toISOString(),
      lines: input.lines,
      estimate: input.base.estimate,
      sourceUrl: input.base.sourceUrl ?? undefined,
      note: replaced && keepsNote(replaced, input.base) ? (replaced.note ?? undefined) : undefined,
    };
    let result: { error?: string; id?: string; effectiveFrom?: string };
    try {
      result = replaced ? await replaceAiModelPriceAction({ ...row, replaceId: replaced.id }) : await addAiModelPriceAction(row);
    } catch {
      result = { error: SAVE_ERROR };
    }
    if (result.error || !result.effectiveFrom) {
      toast.error(result.error ?? SAVE_ERROR);
      return false;
    }
    router.refresh();
    const effective = new Date(result.effectiveFrom);
    const after = new Date();
    const message = savedMessage({
      label: input.label,
      mode: input.when.mode,
      replaced: replaced ? new Date(replaced.effectiveFrom) : null,
      requested,
      effective,
      now: after,
    });
    const otherScheduled = input.prices.some((p) => p.id !== replaced?.id && new Date(p.effectiveFrom) > after);
    const plan = undoPlan({ effective, now: after, replaced, otherScheduled });
    const id = result.id;
    toast.success(message, plan && id ? { duration: 10_000, action: { label: "Undo", onClick: () => void undo(plan, input.modelId, id, replaced) } } : undefined);
    return true;
  };
}
