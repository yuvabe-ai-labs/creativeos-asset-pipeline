import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// D529, D538 — migration 0077 has been applied, so it is frozen history and never regenerated.
// Model data changes since then go in later migrations (0084 re-syncs from the registries).
const FILE = resolve(process.cwd(), "supabase/migrations/0077_ai_models_seed.sql");
const FROZEN_SHA256 = "6e252006ec4cb79043c66befe5517df5644e11e5df78197c33b1c9e61728e88d";

describe("migration 0077 (ai_models seed)", () => {
  it("is unchanged", () => {
    const sql = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(FROZEN_SHA256);
  });
});
