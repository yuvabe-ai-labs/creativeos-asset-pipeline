// After a change-prices save: the toast's words with the start the server gave, how its Undo takes the
// save back, and the toast after an Undo. Client-safe.
import { CATALOG_CHANGE_LEAD_MS } from "@/lib/ai-models/pricing";
import type { AiModelPrice } from "@/lib/ai-models/types";
import { formatIstDate, formatIstTime, formatIstWhen } from "./ist";
import type { When } from "./change-prices-when";

const moved = (requested: Date, effective: Date) => Math.abs(effective.getTime() - requested.getTime()) > 1000;

/** The toast after saving, with the start the server gave (a start in the next 2 minutes is moved out to 2 minutes). */
export function savedMessage(a: { label: string; mode: When["mode"]; replaced: Date | null; requested: Date; effective: Date; now: Date }): string {
  if (a.replaced) return `The ${formatIstDate(a.replaced, false)} change for ${a.label} is replaced.`;
  if (moved(a.requested, a.effective) && a.effective.getTime() > a.now.getTime()) {
    const minutes = Math.max(1, Math.round((a.effective.getTime() - a.now.getTime()) / 60_000));
    return `New prices for ${a.label} start in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}, at ${formatIstTime(a.effective)}.`;
  }
  if (a.mode === "now") return `New prices for ${a.label} are live.`;
  return `New prices for ${a.label} scheduled for ${formatIstWhen(a.effective)}.`;
}

/**
 * How the toast's Undo takes the save back: cancel a row that hasn't started, put a replaced change
 * back, or undo a started row (undoAiModelPriceAction). Null when the server would refuse: a row in
 * its last 2 minutes can't be cancelled; a started row can't be undone while a change is scheduled,
 * nor when no started price came before it (the model's first price).
 */
export function undoPlan(a: {
  effective: Date;
  now: Date;
  replaced: AiModelPrice | null;
  otherScheduled: boolean;
  /** A price had already started before this one: the row an Undo goes back to. */
  earlierStarted: boolean;
}): "cancel" | "restore" | "undo" | null {
  const ahead = a.effective.getTime() - a.now.getTime();
  if (ahead > CATALOG_CHANGE_LEAD_MS) return a.replaced ? "restore" : "cancel";
  if (ahead > 0) return null;
  return a.otherScheduled || !a.earlierStarted ? null : "undo";
}

/** The toast after an Undo; putting a replaced change back says when it now starts if the server moved it. */
export function undoneMessage(restored: { requested: Date; effective: Date } | null): string {
  if (restored && moved(restored.requested, restored.effective)) return `Prices are back as they were, starting ${formatIstWhen(restored.effective)}.`;
  return "Undone. Prices are back as they were.";
}

/** Editing a scheduled change and saving over it keeps its note; anything else saved over it replaces the note too. */
export function keepsNote(replaced: AiModelPrice | null, base: AiModelPrice): boolean {
  return replaced !== null && replaced.id === base.id;
}
