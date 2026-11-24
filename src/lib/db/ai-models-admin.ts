import "server-only";
// D547 — the super admin's view of the model catalog. Unlike the app's loader it keeps rows that
// fail their check, so a broken row can be seen and fixed.
import { createServerSupabase } from "@/lib/supabase/server";
import {
  MODEL_COLUMNS,
  PRICE_COLUMNS,
  checkAiModelRow,
  checkAiModelPriceRow,
} from "@/lib/ai-models/schema";
import type { AiModel, AiModelPrice, PriceLine } from "@/lib/ai-models/types";

export type AdminModelRow = {
  raw: Record<string, unknown>;
  model: AiModel | null;
  problems: string[];
  updatedBy: string | null;
};
// A price row that fails its check is kept (price null) so the admin can see it and cancel it.
export type AdminPriceRow = {
  price: AiModelPrice | null;
  problems: string[];
  id: string;
  modelId: string;
  effectiveFrom: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  raw: Record<string, unknown>;
};

// The text the guard trigger in migration 0076 raises when a price that has started is deleted.
export const PRICE_STARTED_DB_MESSAGE = "a price that has started cannot be deleted";
// The text replace_ai_model_price (migration 0088) raises when the row to replace has started or
// belongs to another model.
export const REPLACE_STARTED_DB_MESSAGE = "only a price that has not started can be replaced";
export type ModelMonthStats = { modelId: string; runs: number; costUsd: number; credits: number; unpriced: number };
export type ModelAgencyRuns = { modelId: string; orgId: string; orgName: string; runs: number; costUsd: number; credits: number };
export type NewPriceRow = {
  modelId: string;
  effectiveFrom: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  sourceUrl: string | null;
  note: string | null;
};

function toAdminModel(raw: Record<string, unknown>): AdminModelRow {
  const { model, problems } = checkAiModelRow(raw);
  return { raw, model, problems, updatedBy: (raw.updated_by as string | null) ?? null };
}

export async function listAdminModels(): Promise<AdminModelRow[]> {
  const { data, error } = await createServerSupabase()
    .from("ai_models")
    .select(`${MODEL_COLUMNS}, updated_by`)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toAdminModel);
}

export async function getAdminModel(id: string): Promise<AdminModelRow | null> {
  const { data, error } = await createServerSupabase()
    .from("ai_models")
    .select(`${MODEL_COLUMNS}, updated_by`)
    .eq("id", id);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  return row ? toAdminModel(row) : null;
}

export async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  const { data, error } = await createServerSupabase().from("profiles").select("id, display_name").in("id", userIds);
  if (error) throw new Error(error.message);
  for (const p of (data ?? []) as unknown as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  return names;
}

export async function listAdminPrices(modelId?: string): Promise<AdminPriceRow[]> {
  let query = createServerSupabase()
    .from("ai_model_prices")
    .select(`${PRICE_COLUMNS}, created_at, created_by`)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
  if (modelId) query = query.eq("model_id", modelId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const raws = (data ?? []) as unknown as Record<string, unknown>[];
  const creators = [...new Set(raws.map((r) => r.created_by as string | null).filter((v): v is string => !!v))];
  const names = await displayNames(creators);
  const rows: AdminPriceRow[] = [];
  for (const raw of raws) {
    const { price, problems } = checkAiModelPriceRow(raw);
    const createdBy = (raw.created_by as string | null) ?? null;
    rows.push({
      price,
      problems,
      id: String(raw.id),
      modelId: String(raw.model_id),
      effectiveFrom: String(raw.effective_from),
      createdAt: String(raw.created_at),
      createdBy,
      createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
      raw,
    });
  }
  return rows;
}

export async function modelMonthStats(from: string, to: string, modelId?: string): Promise<ModelMonthStats[]> {
  const { data, error } = await createServerSupabase().rpc("ai_model_month_stats", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    modelId: String(r.model_id),
    runs: Number(r.runs),
    costUsd: Number(r.cost_usd),
    credits: Number(r.credits),
    unpriced: Number(r.unpriced),
  }));
  return modelId ? rows.filter((r) => r.modelId === modelId) : rows;
}

/** This month's runs per agency per model, from one grouped query (migration 0088). */
export async function modelRunsByAgency(from: string, to: string, modelId?: string): Promise<ModelAgencyRuns[]> {
  const { data, error } = await createServerSupabase().rpc("ai_model_month_runs_by_org", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    modelId: String(r.model_id),
    orgId: String(r.org_id),
    orgName: String(r.org_name),
    runs: Number(r.runs),
    costUsd: Number(r.cost_usd),
    credits: Number(r.credits),
  }));
  return modelId ? rows.filter((r) => r.modelId === modelId) : rows;
}

/** Writes sort_order 0..n-1 for the models of one kind, in one statement (migration 0088); changed rows get updated_by. */
export async function reorderAiModels(kind: string, ids: string[], userId: string): Promise<void> {
  const { error } = await createServerSupabase().rpc("reorder_ai_models", { p_kind: kind, p_ids: ids, p_updated_by: userId });
  if (error) throw new Error(error.message);
}

/**
 * Deletes a price of `row.modelId` that hasn't started and inserts the new one, in one transaction
 * (migration 0088). A row that has started, or is another model's, is `replaced: false`.
 */
export async function replaceAiModelPrice(cancelId: string, row: NewPriceRow, userId: string): Promise<{ replaced: boolean; id?: string }> {
  const { data, error } = await createServerSupabase().rpc("replace_ai_model_price", {
    p_cancel_id: cancelId,
    p_model_id: row.modelId,
    p_effective_from: row.effectiveFrom,
    p_lines: row.lines,
    p_estimate: row.estimate,
    p_source_url: row.sourceUrl,
    p_note: row.note,
    p_created_by: userId,
  });
  if (error) {
    if (error.message.includes(REPLACE_STARTED_DB_MESSAGE)) return { replaced: false };
    throw new Error(error.message);
  }
  return { replaced: true, id: String(data) };
}

export async function updateAiModelRow(id: string, fields: Record<string, unknown>, userId: string): Promise<void> {
  const { error } = await createServerSupabase()
    .from("ai_models")
    .update({ ...fields, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function insertAiModelPrice(row: NewPriceRow, userId: string): Promise<void> {
  const { error } = await createServerSupabase().from("ai_model_prices").insert({
    model_id: row.modelId,
    effective_from: row.effectiveFrom,
    lines: row.lines,
    estimate: row.estimate,
    source_url: row.sourceUrl,
    note: row.note,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

/** A price that has started cannot be deleted: the database guard raises, and that is not an error here. Only a price of `modelId` is touched; no match means `deleted: false`. */
export async function deleteAiModelPrice(id: string, modelId: string): Promise<{ deleted: boolean }> {
  const { data, error } = await createServerSupabase().from("ai_model_prices").delete().eq("id", id).eq("model_id", modelId).select("id");
  if (error) {
    if (error.message.includes(PRICE_STARTED_DB_MESSAGE)) return { deleted: false };
    throw new Error(error.message);
  }
  return { deleted: ((data ?? []) as unknown[]).length > 0 };
}
