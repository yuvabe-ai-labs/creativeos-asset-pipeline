// D529 — the ai_models seed row shape and the SQL writer. Migration 0077 was generated from the
// code registries of the day and is frozen (seed-migration.test.ts). A model change is a new migration.
import type { AiModelKind } from "./types";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";

export const SEED_JSON_TAG = "$seed$";

export type AiModelSeedRow = {
  id: string;
  provider: string;
  kind: AiModelKind;
  label: string;
  picker_label: string | null;
  provider_label: string;
  status: "live" | "retired";
  replaced_by: string | null;
  sort_order: number;
  adapter_key: string;
  params: ParamSpec[];
  rules: ConstraintRule[];
  capabilities: Record<string, unknown>;
};

export function seedSql(rows: AiModelSeedRow[], header: string[]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(SEED_JSON_TAG)) throw new Error(`Seed JSON contains ${SEED_JSON_TAG}`);
  const cols =
    "id, provider, kind, label, picker_label, provider_label, status, replaced_by, sort_order, " +
    "adapter_key, params, rules, capabilities";
  return [
    ...header,
    `insert into ai_models (${cols})`,
    `select ${cols}`,
    `from jsonb_to_recordset(${SEED_JSON_TAG}${json}${SEED_JSON_TAG}::jsonb) as r(`,
    "  id text, provider text, kind text, label text, picker_label text, provider_label text,",
    "  status text, replaced_by text, sort_order integer, adapter_key text,",
    "  params jsonb, rules jsonb, capabilities jsonb",
    ")",
    "on conflict (id) do nothing;",
    "",
  ].join("\n");
}
