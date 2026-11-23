import "server-only";
// D547 — the super admin's view of the model catalog. Unlike the app's loader it keeps rows that
// fail their check, so a broken row can be seen and fixed.
import { createServerSupabase } from "@/lib/supabase/server";
import {
  MODEL_COLUMNS,
  PRICE_COLUMNS,
  checkAiModelRow,
  parseAiModelPriceRow,
} from "@/lib/ai-models/schema";
import type { AiModel, AiModelPrice, PriceLine } from "@/lib/ai-models/types";

export type AdminModelRow = {
  raw: Record<string, unknown>;
  model: AiModel | null;
  problems: string[];
  updatedBy: string | null;
};
export type AdminPriceRow = AiModelPrice & { createdAt: string; createdBy: string | null; createdByName: string | null };
export type ModelMonthStats = { modelId: string; runs: number; costUsd: number; credits: number; unpriced: number };

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
    const price = parseAiModelPriceRow(raw);
    if (!price) continue;
    const createdBy = (raw.created_by as string | null) ?? null;
    rows.push({
      ...price,
      createdAt: String(raw.created_at),
      createdBy,
      createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
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

export async function updateAiModelRow(id: string, fields: Record<string, unknown>, userId: string): Promise<void> {
  const { error } = await createServerSupabase()
    .from("ai_models")
    .update({ ...fields, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function insertAiModelPrice(
  row: {
    modelId: string;
    effectiveFrom: string;
    lines: PriceLine[];
    estimate: Record<string, number>;
    sourceUrl: string | null;
    note: string | null;
  },
  userId: string,
): Promise<void> {
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

/** A price that has started cannot be deleted: the database guard raises, and that is not an error here. */
export async function deleteAiModelPrice(id: string): Promise<{ deleted: boolean }> {
  const { data, error } = await createServerSupabase().from("ai_model_prices").delete().eq("id", id).select("id");
  if (error) {
    if (error.message.includes("has started cannot be deleted")) return { deleted: false };
    throw new Error(error.message);
  }
  return { deleted: ((data ?? []) as unknown[]).length > 0 };
}
