import { describe, it, expect } from "vitest";
import { seedRowsFromRegistries, seedSql } from "../seed";
import { parseAiModelRow } from "../schema";
import { toImageClientSpec, toVideoClientSpec } from "../to-spec";
import { imageGenClientModels, DEPRECATED_IMAGE_MODEL_FALLBACK_ID } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "@/lib/video-gen/client-models";

// A seed row as the database returns it: through JSON, with the columns the seed leaves to defaults.
const asStored = (row: object) => ({
  ...JSON.parse(JSON.stringify(row)),
  description: null,
  provider_model_id: null,
  updated_at: "2026-11-21T00:00:00Z",
});

describe("seedRowsFromRegistries", () => {
  const rows = seedRowsFromRegistries();

  it("has one row per image and video model, ids unique", () => {
    const expected = imageGenClientModels.length + Object.keys(videoGenClientModelMap).length;
    expect(rows).toHaveLength(expected);
    expect(new Set(rows.map((r) => r.id)).size).toBe(expected);
  });

  it("passes the catalog's row check, every row", () => {
    for (const row of rows) expect(parseAiModelRow(asStored(row)), row.id).not.toBeNull();
  });

  it("retires the deprecated models, pointing at today's fallbacks, after every live row", () => {
    const firstRetired = rows.findIndex((r) => r.status === "retired");
    expect(rows.slice(firstRetired).every((r) => r.status === "retired")).toBe(true);
    for (const r of rows.filter((x) => x.status === "retired")) {
      expect(r.replaced_by).toBe(r.kind === "image" ? DEPRECATED_IMAGE_MODEL_FALLBACK_ID : DEFAULT_VIDEO_CLIENT_MODEL_ID);
    }
    expect(rows.find((r) => r.id === "openai:gpt-image-1")?.status).toBe("retired");
    expect(rows.filter((r) => r.id.startsWith("veo:")).every((r) => r.status === "retired")).toBe(true);
  });
});

describe("catalog row → client spec (round trip)", () => {
  const byId = new Map(seedRowsFromRegistries().map((r) => [r.id, parseAiModelRow(asStored(r))!]));

  it("gives back every image spec as the registry has it", () => {
    for (const spec of imageGenClientModels) {
      const { schema: expectedSchema, ...expected } = spec;
      const { schema, ...actual } = toImageClientSpec(byId.get(spec.id)!);
      expect(actual, spec.id).toEqual(expected);
      // Same params → same validator: both accept the params' own defaults.
      expect(schema.safeParse({}).success).toBe(expectedSchema.safeParse({}).success);
    }
  });

  it("gives back every video spec as the registry has it", () => {
    for (const spec of Object.values(videoGenClientModelMap)) {
      expect(toVideoClientSpec(byId.get(spec.id)!), spec.id).toEqual({ ...spec, rules: spec.rules ?? [] });
    }
  });
});

describe("seedSql", () => {
  it("embeds the rows as JSON inside the $seed$ tag and inserts with on conflict do nothing", () => {
    const rows = seedRowsFromRegistries();
    const sql = seedSql(rows);
    const json = sql.slice(sql.indexOf("$seed$") + 6, sql.lastIndexOf("$seed$"));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
    expect(sql).toContain("insert into ai_models");
    expect(sql).toContain("on conflict (id) do nothing");
  });
});
