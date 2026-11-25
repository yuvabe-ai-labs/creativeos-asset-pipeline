"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addAiModelPriceAction,
  cancelAiModelPriceAction,
  replaceAiModelPriceAction,
  undoAiModelPriceAction,
} from "@/lib/actions/ai-models";
import { replacedRow, startToSave, type When } from "@/lib/admin/change-prices-when";
import { keepsNote, savedMessage, undoneMessage, undoPlan } from "@/lib/admin/change-prices-undo";
import type { AiModelPrice, PriceLine } from "@/lib/ai-models/types";

const SAVE_ERROR = "Could not save. Try again.";

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
    let restored: { requested: Date; effective: Date } | null = null;
    try {
      if (plan === "cancel") error = (await cancelAiModelPriceAction(id, modelId)).error;
      else if (plan === "undo") error = (await undoAiModelPriceAction(modelId, id)).error;
      else if (replaced) {
        // Puts the replaced change back as it was, in place of the new row.
        const r = await replaceAiModelPriceAction({
          replaceId: id,
          modelId,
          effectiveFrom: replaced.effectiveFrom,
          lines: replaced.lines,
          estimate: replaced.estimate,
          sourceUrl: replaced.sourceUrl ?? undefined,
          note: replaced.note ?? undefined,
        });
        error = r.error;
        // The server moves a start inside its 2-minute lead; the toast says when it now starts.
        if (r.effectiveFrom) restored = { requested: new Date(replaced.effectiveFrom), effective: new Date(r.effectiveFrom) };
      }
    } catch {
      error = SAVE_ERROR;
    }
    router.refresh();
    if (error) toast.error(error);
    else toast.success(undoneMessage(restored));
  }

  /** "stale" when the start passed while the review was open: nothing is sent. */
  return async function save(input: SaveInput): Promise<"saved" | "failed" | "stale"> {
    const now = new Date();
    const start = startToSave(input.when, now);
    if ("problem" in start) {
      toast.error(start.problem);
      return "stale";
    }
    const replaced = replacedRow(input.prices, input.when, now);
    // Now is sent as a flag and starts at the server's time, not this browser's.
    const startInput = input.when.mode === "now" ? { now: true as const } : { effectiveFrom: start.at.toISOString() };
    const row = {
      ...startInput,
      modelId: input.modelId,
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
      return "failed";
    }
    router.refresh();
    const effective = new Date(result.effectiveFrom);
    const after = new Date();
    // A Now start is wherever the server's clock put it, never "moved".
    const requested = input.when.mode === "now" ? effective : start.at;
    const message = savedMessage({
      label: input.label,
      mode: input.when.mode,
      replaced: replaced ? new Date(replaced.effectiveFrom) : null,
      requested,
      effective,
      now: after,
    });
    const otherScheduled = input.prices.some((p) => p.id !== replaced?.id && new Date(p.effectiveFrom) > after);
    // The row an Undo of a started price goes back to: one that had started before this save.
    const earlierStarted = input.prices.some((p) => p.id !== replaced?.id && new Date(p.effectiveFrom) <= now);
    const plan = undoPlan({ effective, now: after, replaced, otherScheduled, earlierStarted });
    const id = result.id;
    toast.success(message, plan && id ? { duration: 10_000, action: { label: "Undo", onClick: () => void undo(plan, input.modelId, id, replaced) } } : undefined);
    return "saved";
  };
}
