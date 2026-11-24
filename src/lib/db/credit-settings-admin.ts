import "server-only";
// D548 — the super admin's view of the credit settings. Unlike the catalog loader it keeps rows that
// fail their check, so a broken row can be seen and cancelled.
import { createServerSupabase } from "@/lib/supabase/server";
import { CREDIT_SETTINGS_COLUMNS, checkCreditSettingsRow } from "@/lib/ai-models/schema";
import { displayNames } from "@/lib/db/ai-models-admin";
import type { CreditSettings } from "@/lib/ai-models/types";

export type AdminCreditSettingsRow = {
  settings: CreditSettings | null;
  problems: string[];
  id: string;
  effectiveFrom: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
};

// The text the guard trigger in migration 0086 raises when a row that has started is deleted.
export const CREDIT_SETTINGS_STARTED_DB_MESSAGE = "credit settings that have started cannot be deleted";

export async function listAdminCreditSettings(): Promise<AdminCreditSettingsRow[]> {
  const { data, error } = await createServerSupabase()
    .from("credit_settings")
    .select(`${CREDIT_SETTINGS_COLUMNS}, created_at, created_by`)
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);
  const raws = (data ?? []) as unknown as Record<string, unknown>[];
  const creators = [...new Set(raws.map((r) => r.created_by as string | null).filter((v): v is string => !!v))];
  const names = await displayNames(creators);
  return raws.map((raw) => {
    const { settings, problems } = checkCreditSettingsRow(raw);
    const createdBy = (raw.created_by as string | null) ?? null;
    return {
      settings,
      problems,
      id: String(raw.id),
      effectiveFrom: String(raw.effective_from),
      createdAt: String(raw.created_at),
      createdBy,
      createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
    };
  });
}

export async function insertCreditSettings(
  row: { effectiveFrom: string; marginPercent: number; roundStep: number; note: string | null },
  userId: string,
): Promise<{ id: string }> {
  const { data, error } = await createServerSupabase()
    .from("credit_settings")
    .insert({
      effective_from: row.effectiveFrom,
      margin_percent: row.marginPercent,
      round_step: row.roundStep,
      note: row.note,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: String((data as { id: unknown }).id) };
}

/** A row that has started cannot be deleted: the database guard raises, and that is not an error here. Scoped by id; no match means `deleted: false`. */
export async function deleteCreditSettings(id: string): Promise<{ deleted: boolean }> {
  const { data, error } = await createServerSupabase().from("credit_settings").delete().eq("id", id).select("id");
  if (error) {
    if (error.message.includes(CREDIT_SETTINGS_STARTED_DB_MESSAGE)) return { deleted: false };
    throw new Error(error.message);
  }
  return { deleted: ((data ?? []) as unknown[]).length > 0 };
}
