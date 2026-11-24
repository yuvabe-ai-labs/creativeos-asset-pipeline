"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCreditSettingsAction, cancelCreditSettingsAction } from "@/lib/actions/credit-settings";
import { startToSave, type When } from "@/lib/admin/change-prices-when";
import { creditUndoPlan, savedCreditMessage } from "@/lib/admin/credits-change";
import type { Settings } from "@/lib/admin/credits-page";

const SAVE_ERROR = "Could not save. Try again.";

/**
 * Saves new credit settings through the server's checks. The toast says the start the server gave
 * (a Now start is moved 2 minutes out) and offers Undo only where the server would cancel the row.
 * The page data is read again either way.
 */
export function useSaveCreditSettings() {
  const router = useRouter();

  async function undo(id: string) {
    let error: string | undefined;
    try {
      error = (await cancelCreditSettingsAction(id)).error;
    } catch {
      error = SAVE_ERROR;
    }
    router.refresh();
    if (error) toast.error(error);
    else toast.success("Undone. Today's settings stay.");
  }

  /** "stale" when a date start passed while the review was open: nothing is sent. */
  return async function save(settings: Settings, when: When): Promise<"saved" | "failed" | "stale"> {
    const now = new Date();
    const start = startToSave(when, now);
    if ("problem" in start) {
      toast.error(start.problem);
      return "stale";
    }
    let result: { error?: string; id?: string; effectiveFrom?: string };
    try {
      result = await addCreditSettingsAction({ effectiveFrom: start.at.toISOString(), marginPercent: settings.marginPercent, roundStep: settings.roundStep });
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
    const plan = creditUndoPlan(effective, after);
    toast.success(
      savedCreditMessage({ requested: start.at, effective, now: after }),
      plan && id ? { duration: 10_000, action: { label: "Undo", onClick: () => void undo(id) } } : undefined,
    );
    return "saved";
  };
}
