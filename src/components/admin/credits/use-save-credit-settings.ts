"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCreditSettingsAction, cancelCreditSettingsAction, replaceCreditSettingsAction } from "@/lib/actions/credit-settings";
import { startToSave, type When } from "@/lib/admin/change-prices-when";
import { creditUndoPlan, restoredMessage, savedCreditMessage } from "@/lib/admin/credits-change";
import { settingsWords, type Settings } from "@/lib/admin/credits-page";
import type { CreditSettings } from "@/lib/ai-models/types";

const SAVE_ERROR = "Could not save. Try again.";

/**
 * Saves new credit settings through the server's checks: a replace (one transaction) when they start
 * on the IST day of a scheduled change, otherwise a new row. The toast says the start the server gave
 * (a Now start is moved LEAD_MINUTES out) and offers Undo only where the server would take it back:
 * a new row is cancelled, a replace is put back with a second replace. The page data is read again.
 */
export function useSaveCreditSettings() {
  const router = useRouter();

  async function undo(id: string, replaced: CreditSettings | null, kept: Settings) {
    let error: string | undefined;
    let done = `Undone. Runs keep ${settingsWords(kept)}.`;
    try {
      if (replaced) {
        const r = await replaceCreditSettingsAction({
          replaceId: id,
          effectiveFrom: replaced.effectiveFrom,
          marginPercent: replaced.marginPercent,
          roundStep: replaced.roundStep,
          note: replaced.note ?? undefined,
        });
        error = r.error;
        if (r.effectiveFrom) done = restoredMessage(new Date(replaced.effectiveFrom), new Date(r.effectiveFrom));
      } else error = (await cancelCreditSettingsAction(id)).error;
    } catch {
      error = SAVE_ERROR;
    }
    router.refresh();
    if (error) toast.error(error);
    else toast.success(done);
  }

  /**
   * `replaced` is the scheduled change the save takes the place of; `kept` the settings runs keep if
   * a new change is undone. "stale" when a date start passed while the review was open: nothing is sent.
   */
  return async function save(
    settings: Settings,
    when: When,
    replaced: CreditSettings | null,
    kept: Settings,
  ): Promise<"saved" | "failed" | "stale"> {
    const now = new Date();
    const start = startToSave(when, now);
    if ("problem" in start) {
      toast.error(start.problem);
      return "stale";
    }
    // Now is sent as a flag: the server starts it from its own clock, moved out by the lead.
    const startInput = when.mode === "now" ? { now: true as const } : { effectiveFrom: start.at.toISOString() };
    const row = { ...startInput, marginPercent: settings.marginPercent, roundStep: settings.roundStep };
    let result: { error?: string; id?: string; effectiveFrom?: string };
    try {
      result = replaced ? await replaceCreditSettingsAction({ ...row, replaceId: replaced.id }) : await addCreditSettingsAction(row);
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
    const id = result.id;
    const plan = creditUndoPlan(effective, after, replaced !== null);
    toast.success(
      savedCreditMessage({ requested: start.at, effective, now: after, replaced: replaced ? new Date(replaced.effectiveFrom) : null }),
      plan && id ? { duration: 10_000, action: { label: "Undo", onClick: () => void undo(id, plan === "restore" ? replaced : null, kept) } } : undefined,
    );
    return "saved";
  };
}

