// D535 — a price seed migration's SQL, the same shape as 0078.
import { SEED_JSON_TAG } from "./seed";
import type { PriceLine } from "./types";

export type AiModelPriceSeedRow = {
  model_id: string;
  effective_from: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  source_url: string | null;
  note: string;
};

export function priceSql(rows: AiModelPriceSeedRow[], header: string[]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(SEED_JSON_TAG)) throw new Error(`Seed JSON contains ${SEED_JSON_TAG}`);
  const cols = "model_id, effective_from, lines, estimate, source_url, note";
  return [
    ...header,
    `insert into ai_model_prices (${cols})`,
    `select ${cols}`,
    `from jsonb_to_recordset(${SEED_JSON_TAG}${json}${SEED_JSON_TAG}::jsonb) as r(`,
    "  model_id text, effective_from timestamptz, lines jsonb, estimate jsonb, source_url text, note text",
    ")",
    "on conflict (model_id, effective_from) do nothing;",
    "",
  ].join("\n");
}
