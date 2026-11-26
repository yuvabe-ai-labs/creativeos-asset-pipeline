"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCreditSettingsAction, cancelCreditSettingsAction } from "@/lib/actions/credit-settings";
import { restoredMessage } from "@/lib/admin/credits-change";
import type { NextChange } from "@/lib/admin/credits-overview";
import { SAVE_ERROR } from "./use-save-credit-settings";

/**
 * Cancels the scheduled change through the server's checks, then offers Undo in the toast: the same
 * row is saved again at its start (the server moves it out if that is now inside the lead, and
 * refuses it once the start has passed). The page data is read again either way.
 */
export function useCancelCreditChange() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function undo(next: NextChange) {
    const { effectiveFrom, marginPercent, roundStep, note } = next.restore;
    let r: { error?: string; effectiveFrom?: string };
    try {
      r = await addCreditSettingsAction({ effectiveFrom, marginPercent, roundStep, note: note ?? undefined });
    } catch {
      r = { error: SAVE_ERROR };
    }
    router.refresh();
    if (r.error || !r.effectiveFrom) toast.error(r.error ?? SAVE_ERROR);
    else toast.success(restoredMessage(new Date(effectiveFrom), new Date(r.effectiveFrom)));
  }

  /** True once cancelled. */
  async function cancel(next: NextChange): Promise<boolean> {
    setBusy(true);
    let error: string | undefined;
    try {
      error = (await cancelCreditSettingsAction(next.id)).error;
    } catch {
      error = SAVE_ERROR;
    }
    setBusy(false);
    router.refresh();
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`Cancelled ${next.name}.${next.kept ? ` ${next.kept}` : ""}`, {
      duration: 10_000,
      action: { label: "Undo", onClick: () => void undo(next) },
    });
    return true;
  }

  return { cancel, busy };
}
