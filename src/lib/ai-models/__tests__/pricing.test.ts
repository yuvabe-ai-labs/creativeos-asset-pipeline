import { describe, it, expect } from "vitest";
import { lineFor, priceMeters, currentPrice, priceById } from "../pricing";
import type { AiCatalog, AiModelPrice } from "../types";

const KLING: AiModelPrice = {
  id: "k1", modelId: "kling:kling-3-0", effectiveFrom: "2026-01-01T00:00:00Z", estimate: {},
  sourceUrl: null, note: null,
  lines: [
    { meter: "video_second", unit_usd: 0.126, when: { resolution: "720p", audio: true } },
    { meter: "video_second", unit_usd: 0.084, when: { resolution: "720p", audio: false } },
    { meter: "video_second", unit_usd: 0.168, when: { resolution: "1080p", audio: true } },
  ],
};
const SEEDANCE: AiModelPrice = {
  id: "s1", modelId: "seedance:seedance-2-5", effectiveFrom: "2026-01-01T00:00:00Z", estimate: {},
  sourceUrl: null, note: null,
  lines: [
    { meter: "video_output_token", unit_usd: 0.0000117, when: { resolution: "1080p" } },
    { meter: "video_output_token", unit_usd: 0.0000107 },
  ],
};

describe("lineFor", () => {
  it("picks the first line whose when matches every key", () => {
    expect(lineFor(KLING, "video_second", { resolution: "720p", audio: false })?.unit_usd).toBe(0.084);
    expect(lineFor(KLING, "video_second", { resolution: "1080p", audio: true })?.unit_usd).toBe(0.168);
  });
  it("lets a line with no when match any run, after the specific ones", () => {
    expect(lineFor(SEEDANCE, "video_output_token", { resolution: "1080p" })?.unit_usd).toBe(0.0000117);
    expect(lineFor(SEEDANCE, "video_output_token", { resolution: "480p" })?.unit_usd).toBe(0.0000107);
  });
  it("is null when nothing matches", () => {
    expect(lineFor(KLING, "video_second", { resolution: "1080p", audio: false })).toBeNull();
    expect(lineFor(KLING, "input_token", { resolution: "720p", audio: false })).toBeNull();
  });
});

describe("priceMeters", () => {
  it("sums quantity × unit price over the meters", () => {
    expect(priceMeters(KLING, { video_second: 10 }, { resolution: "720p", audio: true }).usd).toBeCloseTo(1.26, 10);
  });
  it("skips zero quantities and reports meters with no matching line", () => {
    const r = priceMeters(KLING, { video_second: 5, input_token: 100, thought_token: 0 }, { resolution: "720p", audio: false });
    expect(r.usd).toBeCloseTo(0.42, 10);
    expect(r.unpriced).toEqual(["input_token"]);
  });
});

describe("currentPrice / priceById", () => {
  const catalog: AiCatalog = {
    models: [],
    prices: [
      { ...SEEDANCE, id: "old", effectiveFrom: "2026-01-01T00:00:00Z" },
      { ...SEEDANCE, id: "new", effectiveFrom: "2026-12-03T08:00:00Z" },
    ],
  };
  it("is the latest row at or before the moment", () => {
    expect(currentPrice(catalog, SEEDANCE.modelId, new Date("2026-12-03T07:59:59Z"))?.id).toBe("old");
    expect(currentPrice(catalog, SEEDANCE.modelId, new Date("2026-12-03T08:00:00Z"))?.id).toBe("new");
    expect(currentPrice(catalog, "other", new Date())).toBeNull();
  });
  it("finds a row by id", () => {
    expect(priceById(catalog, "new")?.effectiveFrom).toBe("2026-12-03T08:00:00Z");
    expect(priceById(catalog, "missing")).toBeNull();
  });
});
