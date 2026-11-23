import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { adapterSyncRows, adapterSyncSql } from "../adapter-sync";
import { seedRowsFromRegistries } from "../seed";
import { seededModelCatalog } from "../test-catalog";
import { toImageClientSpec, toVideoClientSpec } from "../to-spec";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { videoGenRegistry } from "@/lib/video-gen/registry";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";

// D538 — migration 0084 must hold exactly what the builder makes until Plan 1b-iii deletes the
// registries. After 0084 is applied anywhere, a registry change needs a new migration.
const FILE = resolve(process.cwd(), "supabase/migrations/0084_ai_models_adapters.sql");

describe("migration 0084 (adapter keys, provider model ids, re-sync)", () => {
  it("has one row per image and video model, each with its own adapter key and the provider's model name", () => {
    const rows = adapterSyncRows();
    expect(rows.map((r) => r.id).sort()).toEqual(seedRowsFromRegistries().map((r) => r.id).sort());
    expect(new Set(rows.map((r) => r.adapter_key)).size).toBe(rows.length);
    for (const r of rows) expect(r.provider_model_id, r.id).toMatch(/\S/);
  });

  it("names each provider's own model", () => {
    const byId = new Map(adapterSyncRows().map((r) => [r.id, r]));
    expect(byId.get("openai:gpt-image-2")).toMatchObject({ adapter_key: "image:gpt-image-2", provider_model_id: "gpt-image-2" });
    expect(byId.get("gemini:gemini-nano-banana-2.1")?.provider_model_id).toBe("gemini-nano-banana-2.1");
    expect(byId.get("seedream:seedream-5-0-pro")?.provider_model_id).toBe("dola-seedream-5-0-pro-260628");
    expect(byId.get("kling:kling-3-0-omni")).toMatchObject({ adapter_key: "video:kling-3-0-omni", provider_model_id: "kling-3.0-omni" });
    expect(byId.get("seedance:seedance-2-5")?.provider_model_id).toBe("dreamina-seedance-2-5-260628");
    expect(byId.get("gemini:gemini-omni-1.2-flash")).toMatchObject({
      adapter_key: "video:gemini-omni-1.2-flash",
      provider_model_id: "gemini-omni-1.2-flash",
    });
    expect(byId.get("veo:veo-3.1")?.provider_model_id).toBe("veo-3.1-generate-preview");
  });

  it("never writes a model's status, replacement or order (the admin's)", () => {
    expect(adapterSyncSql(adapterSyncRows())).not.toMatch(/\b(status|replaced_by|sort_order)\s*=/);
  });

  it("matches the builder", () => {
    const sql = adapterSyncSql(adapterSyncRows());
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, sql);
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    expect(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")).toBe(sql);
  });
});

// D538 — moving the server onto the catalog must not change what any live model runs with.
describe("the catalog spec is what the server registries ran with", () => {
  const catalog = seededModelCatalog();
  const row = (id: string) => catalog.models.find((m) => m.id === id)!;

  it("image: every live model, field for field", () => {
    for (const spec of Object.values(imageGenRegistry)) {
      // Retired in the catalog (gpt-image-1, D467): the server spec carries no deprecated flag,
      // only the client spec does, and the route refuses it before it would run.
      if (spec.deprecated || row(spec.id).status === "retired") continue;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- generate and schema are code, not data
      const { generate, schema, ...server } = spec;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- rebuilt from params
      const { schema: rebuilt, ...fromCatalog } = toImageClientSpec(row(spec.id));
      expect(fromCatalog, spec.id).toEqual(server);
    }
  });

  it("video: every live model, with the rules the route read from the client map", () => {
    for (const spec of Object.values(videoGenRegistry)) {
      const client = videoGenClientModelMap[spec.id];
      if (client.deprecated) continue;
      const c = toVideoClientSpec(row(spec.id));
      // The fields the server read. Kling's server specs carry no rules: the route took them from
      // the client map, which is what the catalog was seeded from.
      expect(
        { provider: c.provider, label: c.label, maxDurationSeconds: c.maxDurationSeconds, imageInputs: c.imageInputs, params: c.params, rules: c.rules },
        spec.id,
      ).toEqual({
        provider: spec.provider, label: spec.label, maxDurationSeconds: spec.maxDurationSeconds,
        imageInputs: spec.imageInputs, params: spec.params, rules: client.rules ?? [],
      });
    }
  });

  it("every seeded row, of every kind, passes the catalog's check", () => {
    // seededModelCatalog throws on a row that fails; 20 image and video rows, 5 service rows, 6 text rows.
    expect(catalog.models).toHaveLength(31);
  });
});
