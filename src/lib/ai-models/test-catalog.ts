// D538 — the ai_models rows the migrations leave behind (0077, 0079 and 0082 insert, 0084
// updates), with the seeded prices, for tests anywhere in the app. Not imported by app code.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_JSON_TAG } from "./seed";
import { parseAiModelRow } from "./schema";
import { seededCatalog } from "./test-prices";
import type { AiCatalog, AiModel, AiModelKind } from "./types";

const INSERTS = ["0077_ai_models_seed.sql", "0079_ai_service_models.sql", "0082_ai_text_models.sql"];
const UPDATES = ["0084_ai_models_adapters.sql"];

type SeedJsonRow = Record<string, unknown> & { id: string };

function rowsOf(name: string): SeedJsonRow[] {
  const file = resolve(process.cwd(), "supabase/migrations", name);
  if (!existsSync(file)) return [];
  const sql = readFileSync(file, "utf8");
  return JSON.parse(sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG)));
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
  cached = { models, prices: seededCatalog().prices };
  return cached;
}

/** The catalog with one model changed (status, capabilities, …). The original is untouched. */
export function withModel(catalog: AiCatalog, id: string, patch: Partial<AiModel>): AiCatalog {
  return { ...catalog, models: catalog.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

/** An adapter map with `adapter` under every non-retired seeded row of this kind. */
export function stubAdapters<A>(kind: AiModelKind, adapter: A): Record<string, A> {
  return Object.fromEntries(
    seededModelCatalog()
      .models.filter((m) => m.kind === kind && m.status !== "retired")
      .map((m) => [m.adapterKey, adapter]),
  );
}
