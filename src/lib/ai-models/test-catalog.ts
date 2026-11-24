// D538 — the ai_models rows the migrations leave behind (0077, 0079 and 0082 insert, 0084
// updates), with the seeded prices, for tests anywhere in the app. Not imported by app code.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_JSON_TAG } from "./seed";
import { parseAiModelRow, parseCreditSettingsRow } from "./schema";
import { seededCatalog } from "./test-prices";
import type { AiCatalog, AiModel, AiModelKind, CreditSettings } from "./types";

const INSERTS = ["0077_ai_models_seed.sql", "0079_ai_service_models.sql", "0082_ai_text_models.sql"];
const UPDATES = ["0084_ai_models_adapters.sql"];

type SeedJsonRow = Record<string, unknown> & { id: string };

function rowsOf(name: string): SeedJsonRow[] {
  const file = resolve(process.cwd(), "supabase/migrations", name);
  if (!existsSync(file)) return [];
  const sql = readFileSync(file, "utf8");
  return JSON.parse(sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG)));
}

// D548 — 0086's one `insert … values (…)` row, read from the migration so a test never keeps its own copy.
function seededCreditSettings(): CreditSettings[] {
  const file = resolve(process.cwd(), "supabase/migrations/0086_credit_settings.sql");
  if (!existsSync(file)) return [];
  const m = /values\s*\(\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*\)/i.exec(readFileSync(file, "utf8"));
  if (!m) throw new Error("0086 seed row not found");
  const row = parseCreditSettingsRow({
    id: `credit-settings@${m[1]}`, effective_from: m[1], margin_percent: m[2], round_step: Number(m[3]), note: m[4],
  });
  if (!row) throw new Error("0086 seed row fails the catalog's check");
  return [row];
}

let cached: AiCatalog | null = null;

export function seededModelCatalog(): AiCatalog {
  if (cached) return cached;
  const updates = new Map(UPDATES.flatMap(rowsOf).map((r) => [r.id, r]));
  const models = INSERTS.flatMap(rowsOf).map((row) => {
    // As the database returns it: the columns a seed leaves to defaults, then 0084's update.
    const stored = { description: null, provider_model_id: null, updated_at: "2026-11-23T00:00:00Z", ...row, ...updates.get(row.id) };
    const model = parseAiModelRow(stored);
    if (!model) throw new Error(`seeded row ${row.id} fails the catalog's check`);
    return model;
  });
  cached = { models, prices: seededCatalog().prices, creditSettings: seededCreditSettings() };
  return cached;
}

/** The catalog with one model changed (status, capabilities, …). The original is untouched. */
export function withModel(catalog: AiCatalog, id: string, patch: Partial<AiModel>): AiCatalog {
  return { ...catalog, models: catalog.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

/** The seeded credit settings row (0086: margin 0, step 5), for tests that work out credits. */
export function seededSettingsRow(): CreditSettings {
  const row = seededModelCatalog().creditSettings[0];
  if (!row) throw new Error("0086 credit settings row not found");
  return row;
}

/** D548 — the catalog with its credit settings rows replaced. The original is untouched. */
export function withCreditSettings(
  catalog: AiCatalog,
  rows: Array<Pick<CreditSettings, "effectiveFrom" | "marginPercent" | "roundStep">>,
): AiCatalog {
  return {
    ...catalog,
    creditSettings: rows.map((r) => ({ id: `credit-settings@${r.effectiveFrom}`, note: null, ...r })),
  };
}

/** An adapter map with `adapter` under every non-retired seeded row of this kind. */
export function stubAdapters<A>(kind: AiModelKind, adapter: A): Record<string, A> {
  return Object.fromEntries(
    seededModelCatalog()
      .models.filter((m) => m.kind === kind && m.status !== "retired")
      .map((m) => [m.adapterKey, adapter]),
  );
}
