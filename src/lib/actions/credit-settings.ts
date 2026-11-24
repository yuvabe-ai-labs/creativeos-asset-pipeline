"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { clearAiCatalogCache } from "@/lib/ai-models/catalog";
import { checkNewCreditSettings, CREDIT_SETTINGS_LEAD_MINUTES, CREDIT_SETTINGS_LEAD_MS } from "@/lib/credits/settings-edit";
import { undoNote, undoTarget } from "@/lib/ai-models/model-edit";
import { listAdminCreditSettings, insertCreditSettings, deleteCreditSettings, replaceCreditSettings } from "@/lib/db/credit-settings-admin";

// D548 — the /admin credit settings actions. Platform administration (requireSuperAdmin()-gated), not
// an org's data, so deliberately not wrapped in withAction() (D85). Every write runs its check first
// and nothing is written when a check refuses.

const SAVE_ERROR = "Could not save. Try again.";
const CANCEL_ERROR = "Only a change that hasn't started can be cancelled.";
const CANCEL_SOON_ERROR = `This change starts in less than ${CREDIT_SETTINGS_LEAD_MINUTES} minutes and can't be cancelled now.`;
const REPLACE_ERROR = "Only a change that hasn't started can be replaced.";
const REPLACE_SOON_ERROR = `This change starts in less than ${CREDIT_SETTINGS_LEAD_MINUTES} minutes and can't be replaced now.`;
const UNDO_ERROR = "Only the latest change you made in the last 24 hours can be undone.";
const NO_PREVIOUS_ERROR = "There are no earlier settings to go back to.";
const UNDO_ERRORS = {
  "not-undoable": UNDO_ERROR,
  scheduled: "There's a change scheduled. Cancel it first, then undo.",
  "no-previous": NO_PREVIOUS_ERROR,
} as const;

function refresh(): void {
  clearAiCatalogCache();
  revalidatePath("/admin/credits");
}

export async function addCreditSettingsAction(input: {
  effectiveFrom: string;
  marginPercent: number;
  roundStep: number;
  note?: string;
}): Promise<{ error?: string; id?: string; effectiveFrom?: string }> {
  const caller = await requireSuperAdmin();
  if (typeof input?.effectiveFrom !== "string") return { error: SAVE_ERROR };
  let effective = "";
  let id = "";
  try {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { error: SAVE_ERROR };
    // A fresh read: a cached catalog may be up to a minute old. A row that fails its check still
    // holds its start in the database, so every row counts.
    const rows = await listAdminCreditSettings();
    const checked = checkNewCreditSettings(
      { effectiveFrom, marginPercent: input.marginPercent, roundStep: input.roundStep, note: input.note },
      rows.map((r) => ({ effectiveFrom: r.effectiveFrom })),
      new Date(),
    );
    if (!checked.ok) return { error: checked.error };
    id = (await insertCreditSettings(checked.value, caller.userId)).id;
    effective = checked.value.effectiveFrom;
  } catch (e) {
    console.error("addCreditSettingsAction failed", e);
    return { error: SAVE_ERROR };
  }
  refresh();
  // The new row's id (the toast's Undo cancels it) and the start it really got: it is moved out to
  // the lead time when asked for sooner.
  return { id, effectiveFrom: effective };
}

/**
 * D549 — saves new settings in place of a change that hasn't started (the Credits page, when the new
 * start falls on that change's IST day), in one transaction. The replaced row is left out of the clash
 * check, so the new settings may take its exact start.
 */
export async function replaceCreditSettingsAction(input: {
  replaceId: string;
  effectiveFrom: string;
  marginPercent: number;
  roundStep: number;
  note?: string;
}): Promise<{ error?: string; id?: string; effectiveFrom?: string }> {
  const caller = await requireSuperAdmin();
  if (typeof input?.replaceId !== "string" || typeof input.effectiveFrom !== "string") return { error: SAVE_ERROR };
  let effective = "";
  let id = "";
  try {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { error: SAVE_ERROR };
    // A fresh read; the database checks the replaced row's start again.
    const rows = await listAdminCreditSettings();
    const now = new Date();
    const replaced = rows.find((r) => r.id === input.replaceId);
    if (!replaced) return { error: REPLACE_ERROR };
    const at = new Date(replaced.effectiveFrom).getTime();
    if (at <= now.getTime()) return { error: REPLACE_ERROR };
    if (at <= now.getTime() + CREDIT_SETTINGS_LEAD_MS) return { error: REPLACE_SOON_ERROR };
    const checked = checkNewCreditSettings(
      { effectiveFrom, marginPercent: input.marginPercent, roundStep: input.roundStep, note: input.note },
      rows.filter((r) => r.id !== input.replaceId).map((r) => ({ effectiveFrom: r.effectiveFrom })),
      now,
    );
    if (!checked.ok) return { error: checked.error };
    const done = await replaceCreditSettings(input.replaceId, checked.value, caller.userId);
    if (!done.replaced) return { error: REPLACE_ERROR };
    id = done.id ?? "";
    effective = checked.value.effectiveFrom;
  } catch (e) {
    console.error("replaceCreditSettingsAction failed", input.replaceId, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return { id, effectiveFrom: effective };
}

export async function cancelCreditSettingsAction(id: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  if (typeof id !== "string") return { error: SAVE_ERROR };
  try {
    // A fresh read, scoped by id: a row about to start may already be in use on some server.
    const row = (await listAdminCreditSettings()).find((r) => r.id === id);
    if (row && new Date(row.effectiveFrom).getTime() <= Date.now() + CREDIT_SETTINGS_LEAD_MS) {
      return { error: new Date(row.effectiveFrom).getTime() <= Date.now() ? CANCEL_ERROR : CANCEL_SOON_ERROR };
    }
    const { deleted } = await deleteCreditSettings(id);
    if (!deleted) return { error: CANCEL_ERROR };
  } catch (e) {
    console.error("cancelCreditSettingsAction failed", id, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return {};
}

/**
 * D549 — takes back the latest started settings, if this admin added them in the last 24 hours: a
 * new row repeats the settings before it. Like any change it starts CREDIT_SETTINGS_LEAD_MS out, not
 * now, so the start it got is returned for the screen to say so. A change that hasn't started is
 * cancelled instead (cancelCreditSettingsAction).
 */
export async function undoCreditSettingsAction(id: string): Promise<{ error?: string; id?: string; effectiveFrom?: string }> {
  const caller = await requireSuperAdmin();
  if (typeof id !== "string") return { error: SAVE_ERROR };
  let effective = "";
  let newId = "";
  try {
    const rows = await listAdminCreditSettings();
    const now = new Date();
    const target = undoTarget(rows, id, caller.userId, now);
    if (!target.ok) return { error: UNDO_ERRORS[target.reason] };
    const before = target.previous.settings;
    if (!before) {
      console.error("undoCreditSettingsAction refused: the earlier settings fail their check", id, target.previous.id, target.previous.problems);
      return { error: SAVE_ERROR };
    }
    const checked = checkNewCreditSettings(
      { effectiveFrom: now, marginPercent: before.marginPercent, roundStep: before.roundStep, note: undoNote(target.undone.effectiveFrom) },
      rows.map((r) => ({ effectiveFrom: r.effectiveFrom })),
      now,
    );
    if (!checked.ok) return { error: checked.error };
    newId = (await insertCreditSettings(checked.value, caller.userId)).id;
    effective = checked.value.effectiveFrom;
  } catch (e) {
    console.error("undoCreditSettingsAction failed", id, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return { id: newId, effectiveFrom: effective };
}
