"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getAiCatalog, clearAiCatalogCache } from "@/lib/ai-models/catalog";
import { RUNNABLE_ADAPTER_KEYS } from "@/lib/ai-models/runnable-keys";
import { checkModelPatch, checkNewPrice, priceConditionProblems } from "@/lib/ai-models/model-edit";
import {
  getAdminModel,
  listAdminPrices,
  updateAiModelRow,
  insertAiModelPrice,
  deleteAiModelPrice,
} from "@/lib/db/ai-models-admin";
import type { AiModelPrice, PriceLine } from "@/lib/ai-models/types";

// D546 — the /admin model actions. Platform administration (requireSuperAdmin()-gated), not an
// org's data, so deliberately not wrapped in withAction() (D85). Every write runs its check first
// and nothing is written when a check refuses.

const SAVE_ERROR = "Could not save. Try again.";
const CANCEL_ERROR = "Only a price that hasn't started can be cancelled.";

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
  try {
    const [row, catalog] = await Promise.all([getAdminModel(id), getAiCatalog()]);
    if (!row) return { error: SAVE_ERROR };
    const checked = checkModelPatch(row.raw, patch, {
      models: catalog.models,
      prices: catalog.prices,
      runnableKeys: RUNNABLE_ADAPTER_KEYS,
    });
    if (!checked.ok) {
      if (checked.log !== undefined) console.error("updateAiModelAction refused", id, checked.log);
      return { error: checked.error };
    }
    await updateAiModelRow(id, checked.fields, caller.userId);
    refresh(id);
    return {};
  } catch (e) {
    console.error("updateAiModelAction failed", id, e);
    return { error: SAVE_ERROR };
  }
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
  try {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { error: SAVE_ERROR };
    const [row, rows] = await Promise.all([getAdminModel(input.modelId), listAdminPrices(input.modelId)]);
    // The model must pass the catalog's own check, or no price for it could ever be read.
    if (!row?.model) return { error: SAVE_ERROR };
    // A row that fails its check still holds its start in the database, so every row counts.
    const existing = rows.map((r) => r.price ?? ({ modelId: r.modelId, effectiveFrom: r.effectiveFrom } as AiModelPrice));
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
    refresh(input.modelId);
    return {};
  } catch (e) {
    console.error("addAiModelPriceAction failed", input.modelId, e);
    return { error: SAVE_ERROR };
  }
}

export async function cancelAiModelPriceAction(priceId: string, modelId: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  try {
    const { deleted } = await deleteAiModelPrice(priceId);
    if (!deleted) return { error: CANCEL_ERROR };
    refresh(modelId);
    return {};
  } catch (e) {
    console.error("cancelAiModelPriceAction failed", priceId, e);
    return { error: SAVE_ERROR };
  }
}
