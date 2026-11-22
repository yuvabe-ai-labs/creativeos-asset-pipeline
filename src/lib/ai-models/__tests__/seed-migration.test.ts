import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedRowsFromRegistries, seedSql, SEED_JSON_TAG } from "../seed";

// D529 — migration 0077 must hold exactly today's registries until Plan 1b deletes them.
// After 0077 is applied anywhere, a registry change needs a new migration, not a rewrite of 0077.
// Vitest runs from the repo root.
const FILE = resolve(process.cwd(), "supabase/migrations/0077_ai_models_seed.sql");

describe("migration 0077 (ai_models seed)", () => {
  it("matches the registries", () => {
    const rows = seedRowsFromRegistries();
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, seedSql(rows));

    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    const sql = readFileSync(FILE, "utf8");
    const json = sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});
