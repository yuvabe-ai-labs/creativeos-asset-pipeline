"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getAiCatalog, clearAiCatalogCache } from "@/lib/ai-models/catalog";
import { RUNNABLE_ADAPTER_KEYS } from "@/lib/ai-models/runnable-keys";
import { checkModelPatch, checkNewPrice, priceConditionProblems, undoNote, undoTarget } from "@/lib/ai-models/model-edit";
import {
  getAdminModel,
  listAdminModels,
  listAdminPrices,
  updateAiModelRow,
  insertAiModelPrice,
  deleteAiModelPrice,
  replaceAiModelPrice,
  reorderAiModels,
  type AdminPriceRow,
  type NewPriceRow,
} from "@/lib/db/ai-models-admin";
import type { AiModel, PriceLine } from "@/lib/ai-models/types";

// D546 — the /admin model actions. Platform administration (requireSuperAdmin()-gated), not an
// org's data, so deliberately not wrapped in withAction() (D85). Every write runs its check first
// and nothing is written when a check refuses.

const SAVE_ERROR = "Could not save. Try again.";
const BREAK_ERROR = "These changes would break the model's settings.";
const CANCEL_ERROR = "Only a price that hasn't started can be cancelled.";
const SOURCE_ERROR = "Enter a full web address for the source, or leave it empty.";
const REPLACE_ERROR = "Only a price that hasn't started can be replaced.";
const ORDER_ERROR = "The list of models changed. Reload and try again.";
const UNDO_ERROR = "Only the latest price change you made in the last 24 hours can be undone.";
const NO_PREVIOUS_ERROR = "There is no earlier price to go back to.";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The source as stored: an http(s) address, null when empty, undefined when it is not one. */
function sourceUrlOf(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const text = v.trim();
  if (text === "") return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? text : undefined;
  } catch {
    return undefined;
  }
}

function refresh(): void {
  clearAiCatalogCache();
  revalidatePath("/admin/models");
  // The route pattern: a model id holds a colon, so its literal path would need encoding to match.
  revalidatePath("/admin/models/[id]", "page");
}

export async function updateAiModelAction(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  if (typeof id !== "string" || !isObject(patch)) return { error: BREAK_ERROR };
  try {
    // The models come from a fresh read (a cached catalog may be up to a minute old); prices can
    // stay cached, since no model check reads them yet.
    const [row, catalog, fresh] = await Promise.all([getAdminModel(id), getAiCatalog(), listAdminModels()]);
    if (!row) return { error: SAVE_ERROR };
    const checked = checkModelPatch(row.raw, patch, {
      models: fresh.flatMap((r) => (r.model ? [r.model] : [])),
      prices: catalog.prices,
      runnableKeys: RUNNABLE_ADAPTER_KEYS,
    });
    if (!checked.ok) {
      if (checked.log !== undefined) console.error("updateAiModelAction refused", id, checked.log);
      return { error: checked.error };
    }
    await updateAiModelRow(id, checked.fields, caller.userId);
  } catch (e) {
    console.error("updateAiModelAction failed", id, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return {};
}

type PriceInput = {
  modelId: string;
  effectiveFrom: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  sourceUrl?: string;
  note?: string;
};

/** The input's shape and source, before any read. An error, or the source as stored. */
function priceInputProblem(input: PriceInput): { error: string } | { sourceUrl: string | null } {
  if (
    typeof input?.modelId !== "string" ||
    !Array.isArray(input.lines) ||
    !input.lines.every(isObject) ||
    !isObject(input.estimate)
  ) {
    return { error: BREAK_ERROR };
  }
  const sourceUrl = sourceUrlOf(input.sourceUrl);
  return sourceUrl === undefined ? { error: SOURCE_ERROR } : { sourceUrl };
}

/**
 * Runs checkNewPrice against a fresh read of the model's prices. A row that fails its check still
 * holds its start in the database, so every row counts, except `excludeId` (the row a replace deletes).
 */
function checkPrice(
  action: string,
  model: AiModel,
  rows: AdminPriceRow[],
  row: Omit<NewPriceRow, "effectiveFrom"> & { effectiveFrom: Date },
  now: Date,
  excludeId?: string,
): { error: string } | NewPriceRow {
  const existing = rows.filter((r) => r.id !== excludeId).map((r) => ({ modelId: r.modelId, effectiveFrom: r.effectiveFrom }));
  const checked = checkNewPrice(model, { effectiveFrom: row.effectiveFrom, lines: row.lines, estimate: row.estimate }, existing, now);
  if (!checked.ok) {
    const problems = priceConditionProblems(model, row.lines);
    if (problems.length > 0) console.error(`${action} refused`, model.id, problems);
    return { error: checked.error };
  }
  return { ...row, effectiveFrom: row.effectiveFrom.toISOString() };
}

export async function addAiModelPriceAction(input: PriceInput): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  const shape = priceInputProblem(input);
  if ("error" in shape) return shape;
  try {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { error: SAVE_ERROR };
    const [row, rows] = await Promise.all([getAdminModel(input.modelId), listAdminPrices(input.modelId)]);
    // The model must pass the catalog's own check, or no price for it could ever be read.
    if (!row?.model) return { error: SAVE_ERROR };
    const price = checkPrice(
      "addAiModelPriceAction",
      row.model,
      rows,
      { modelId: input.modelId, effectiveFrom, lines: input.lines, estimate: input.estimate, sourceUrl: shape.sourceUrl, note: input.note ?? null },
      new Date(),
    );
    if ("error" in price) return price;
    await insertAiModelPrice(price, caller.userId);
  } catch (e) {
    console.error("addAiModelPriceAction failed", input.modelId, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return {};
}

/** D549 — swaps a price that hasn't started for a new one, in one transaction. */
export async function replaceAiModelPriceAction(input: PriceInput & { replaceId: string }): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  if (typeof input?.replaceId !== "string") return { error: BREAK_ERROR };
  const shape = priceInputProblem(input);
  if ("error" in shape) return shape;
  try {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { error: SAVE_ERROR };
    const [row, rows] = await Promise.all([getAdminModel(input.modelId), listAdminPrices(input.modelId)]);
    if (!row?.model) return { error: SAVE_ERROR };
    const now = new Date();
    // Scoped to the model: the rows read are this model's only. The database checks both again.
    const replaced = rows.find((r) => r.id === input.replaceId);
    if (!replaced || new Date(replaced.effectiveFrom).getTime() <= now.getTime()) return { error: REPLACE_ERROR };
    const price = checkPrice(
      "replaceAiModelPriceAction",
      row.model,
      rows,
      { modelId: input.modelId, effectiveFrom, lines: input.lines, estimate: input.estimate, sourceUrl: shape.sourceUrl, note: input.note ?? null },
      now,
      input.replaceId,
    );
    if ("error" in price) return price;
    const { replaced: done } = await replaceAiModelPrice(input.replaceId, price, caller.userId);
    if (!done) return { error: REPLACE_ERROR };
  } catch (e) {
    console.error("replaceAiModelPriceAction failed", input.modelId, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return {};
}

/** D549 — the order models of one kind are listed and offered in. `orderedIds` is every model of the kind once. */
export async function reorderAiModelsAction(kind: string, orderedIds: string[]): Promise<{ error?: string }> {
  await requireSuperAdmin();
  if (typeof kind !== "string" || !Array.isArray(orderedIds) || orderedIds.length === 0 || !orderedIds.every((id) => typeof id === "string")) {
    return { error: ORDER_ERROR };
  }
  try {
    // A fresh read; rows that fail their check still count, by their raw kind.
    const ofKind = (await listAdminModels()).filter((r) => r.raw.kind === kind);
    const known = new Set(ofKind.map((r) => String(r.raw.id)));
    const given = new Set(orderedIds);
    if (given.size !== orderedIds.length || given.size !== known.size || !orderedIds.every((id) => known.has(id))) {
      return { error: ORDER_ERROR };
    }
    const sortOf = new Map(ofKind.map((r) => [String(r.raw.id), r.raw.sort_order]));
    if (orderedIds.every((id, i) => sortOf.get(id) === i)) return {};
    await reorderAiModels(kind, orderedIds);
  } catch (e) {
    console.error("reorderAiModelsAction failed", kind, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return {};
}

/**
 * D549 — takes back the latest started price of a model, if this admin added it in the last 24
 * hours: a new row, live now, repeats the price before it. A price that hasn't started is cancelled
 * instead (cancelAiModelPriceAction).
 */
export async function undoAiModelPriceAction(modelId: string, priceId: string): Promise<{ error?: string; effectiveFrom?: string }> {
  const caller = await requireSuperAdmin();
  if (typeof modelId !== "string" || typeof priceId !== "string") return { error: SAVE_ERROR };
  let effective = "";
  try {
    const [row, rows] = await Promise.all([getAdminModel(modelId), listAdminPrices(modelId)]);
    if (!row?.model) return { error: SAVE_ERROR };
    const now = new Date();
    const target = undoTarget(rows, priceId, caller.userId, now);
    if (!target.ok) return { error: target.reason === "no-previous" ? NO_PREVIOUS_ERROR : UNDO_ERROR };
    const before = target.previous.price;
    if (!before) return { error: NO_PREVIOUS_ERROR };
    const price = checkPrice(
      "undoAiModelPriceAction",
      row.model,
      rows,
      { modelId, effectiveFrom: now, lines: before.lines, estimate: before.estimate, sourceUrl: null, note: undoNote(target.undone.effectiveFrom) },
      now,
    );
    if ("error" in price) return price;
    await insertAiModelPrice(price, caller.userId);
    effective = price.effectiveFrom;
  } catch (e) {
    console.error("undoAiModelPriceAction failed", modelId, priceId, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return { effectiveFrom: effective };
}

export async function cancelAiModelPriceAction(priceId: string, modelId: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  if (typeof priceId !== "string" || typeof modelId !== "string") return { error: SAVE_ERROR };
  try {
    // Scoped to the model: a price of another model is never cancelled by this call.
    const { deleted } = await deleteAiModelPrice(priceId, modelId);
    if (!deleted) return { error: CANCEL_ERROR };
  } catch (e) {
    console.error("cancelAiModelPriceAction failed", priceId, e);
    return { error: SAVE_ERROR };
  }
  refresh();
  return {};
}
