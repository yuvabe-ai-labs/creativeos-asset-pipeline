import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seededModelCatalog } from "../test-catalog";

// D545 — 0084 is history: its SQL never changes. A model change is a new migration.
const FILE = resolve(process.cwd(), "supabase/migrations/0084_ai_models_adapters.sql");
const FROZEN_SHA256 = "687a19a76c259cc822bc47b467a8cb99992b675ff99d8dd9a83a5cd2c6aa15fd";

describe("migration 0084 (frozen)", () => {
  it("is unchanged", () => {
    const sql = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(FROZEN_SHA256);
  });

  it("gives every image and video model its own adapter key and the provider's model name", () => {
    const rows = seededModelCatalog().models.filter((m) => m.kind === "image" || m.kind === "video");
    expect(new Set(rows.map((r) => r.adapterKey)).size).toBe(rows.length);
    for (const r of rows) expect(r.providerModelId, r.id).toMatch(/\S/);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("seedream:seedream-5-0-pro")?.providerModelId).toBe("dola-seedream-5-0-pro-260628");
    expect(byId.get("kling:kling-3-0-omni")).toMatchObject({ adapterKey: "video:kling-3-0-omni", providerModelId: "kling-3.0-omni" });
    expect(byId.get("seedance:seedance-2-5")?.providerModelId).toBe("dreamina-seedance-2-5-260628");
  });

  it("never writes a model's status, replacement or order (the admin's)", () => {
    expect(readFileSync(FILE, "utf8")).not.toMatch(/\b(status|replaced_by|sort_order)\s*=/);
  });
});
