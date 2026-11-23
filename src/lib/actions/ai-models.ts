"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getAiCatalog, clearAiCatalogCache } from "@/lib/ai-models/catalog";
import { RUNNABLE_ADAPTER_KEYS } from "@/lib/ai-models/runnable-keys";
import { checkModelPatch, checkNewPrice, priceConditionProblems } from "@/lib/ai-models/model-edit";
import {
  getAdminModel,
  listAdminModels,
  listAdminPrices,
  updateAiModelRow,
  insertAiModelPrice,
  deleteAiModelPrice,
} from "@/lib/db/ai-models-admin";
import type { PriceLine } from "@/lib/ai-models/types";

// D546 — the /admin model actions. Platform administration (requireSuperAdmin()-gated), not an
// org's data, so deliberately not wrapped in withAction() (D85). Every write runs its check first
// and nothing is written when a check refuses.

const SAVE_ERROR = "Could not save. Try again.";
const BREAK_ERROR = "These changes would break the model's settings.";
const CANCEL_ERROR = "Only a price that hasn't started can be cancelled.";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function refresh(modelId: string): void {
  clearAiCatalogCache();
  revalidatePath("/admin/models");
  revalidatePath(`/admin/models/${modelId}`);
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
  refresh(id);
  return {};
}

export async function addAiModelPriceAction(input: {
  modelId: string;
  effectiveFrom: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  sourceUrl?: string;
  note?: string;
}): Promise<{ error?: string }> {
  const caller = await requireSuperAdmin();
  if (
    typeof input?.modelId !== "string" ||
    !Array.isArray(input.lines) ||
    !input.lines.every(isObject) ||
    !isObject(input.estimate)
  ) {
    return { error: BREAK_ERROR };
  }
  try {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { error: SAVE_ERROR };
    const [row, rows] = await Promise.all([getAdminModel(input.modelId), listAdminPrices(input.modelId)]);
    // The model must pass the catalog's own check, or no price for it could ever be read.
    if (!row?.model) return { error: SAVE_ERROR };
    // A row that fails its check still holds its start in the database, so every row counts.
    const existing = rows.map((r) => ({ modelId: r.modelId, effectiveFrom: r.effectiveFrom }));
    const checked = checkNewPrice(
      row.model,
      { effectiveFrom, lines: input.lines, estimate: input.estimate },
      existing,
      new Date(),
    );
    if (!checked.ok) {
      const problems = priceConditionProblems(row.model, input.lines);
      if (problems.length > 0) console.error("addAiModelPriceAction refused", input.modelId, problems);
      return { error: checked.error };
    }
    await insertAiModelPrice(
      {
        modelId: input.modelId,
        effectiveFrom: effectiveFrom.toISOString(),
        lines: input.lines,
        estimate: input.estimate,
        sourceUrl: input.sourceUrl ?? null,
        note: input.note ?? null,
      },
      caller.userId,
    );
  } catch (e) {
    console.error("addAiModelPriceAction failed", input.modelId, e);
    return { error: SAVE_ERROR };
  }
  refresh(input.modelId);
  return {};
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
  refresh(modelId);
  return {};
}
