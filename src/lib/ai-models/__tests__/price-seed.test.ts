import { describe, it, expect } from "vitest";
import { priceRowsFromCodeTables, priceSeedSql, seedRowToPrice, PRICE_EPOCH } from "../price-seed";
import { seededPrice } from "../test-prices";
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";

describe("priceRowsFromCodeTables", () => {
  const rows = priceRowsFromCodeTables();

  it("has one epoch row for every image and video model, retired ones included", () => {
    const ids = [...imageGenClientModels.map((m) => m.id), ...Object.keys(videoGenClientModelMap)];
    const epoch = rows.filter((r) => r.effective_from === PRICE_EPOCH).map((r) => r.model_id);
    expect(epoch.sort()).toEqual(ids.sort());
  });

  it("gives Omni 1.1 a second row at 1.2 rates from 3 Dec, and no other model one", () => {
    const later = rows.filter((r) => r.effective_from !== PRICE_EPOCH);
    expect(later.map((r) => [r.model_id, r.effective_from])).toEqual([
      ["gemini:gemini-omni-1.1-flash", "2026-12-03T08:00:00.000Z"],
    ]);
    const omni12 = rows.find((r) => r.model_id === "gemini:gemini-omni-1.2-flash")!;
    expect(later[0].lines).toEqual(omni12.lines);
  });

  it("parses every row with the catalog's price check", () => {
    for (const r of rows) expect(() => seedRowToPrice(r), r.model_id).not.toThrow();
  });

  it("carries Kling's audio and Omni's allowances", () => {
    expect(seededPrice("kling:kling-3-0").lines).toContainEqual(
      { meter: "video_second", unit_usd: 0.126, when: { resolution: "720p", audio: true } },
    );
    expect(seededPrice("gemini:gemini-omni-1.2-flash").estimate).toMatchObject({
      input_tokens_per_image: 1100, thought_tokens: 1500, edit_input_tokens_per_second_360p: 1931,
    });
    expect(seededPrice("gemini:gemini-nano-banana-2.1").estimate).toEqual({
      input_tokens_base: 180, input_tokens_per_reference: 260, text_output_tokens: 1000,
    });
  });
});

describe("priceSeedSql", () => {
  it("embeds the rows as JSON and inserts with on conflict do nothing", () => {
    const rows = priceRowsFromCodeTables();
    const sql = priceSeedSql(rows);
    const json = sql.slice(sql.indexOf("$seed$") + 6, sql.lastIndexOf("$seed$"));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
    expect(sql).toContain("insert into ai_model_prices");
    expect(sql).toContain("on conflict (model_id, effective_from) do nothing");
  });
});
