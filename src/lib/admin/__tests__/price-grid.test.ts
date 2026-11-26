import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { lineFor } from "@/lib/ai-models/pricing";
import { priceDims } from "@/lib/ai-models/model-edit";
import type { AiModel, AiModelPrice } from "@/lib/ai-models/types";
import { lineKey, parseLineKey, priceGrid, startingPrice } from "../price-grid";

const catalog = seededModelCatalog();
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
/** The latest price row of a model (current or scheduled). */
const lastPrice = (id: string): AiModelPrice => {
  const rows = catalog.prices.filter((p) => p.modelId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const row = rows.at(-1);
  if (!row) throw new Error(`no seeded price for ${id}`);
  return row;
};
const media = catalog.models.filter((m) => m.kind === "image" || m.kind === "video");
const priced = (kind: string) =>
  catalog.prices.flatMap((price) => {
    const m = catalog.models.find((x) => x.id === price.modelId);
    return m && m.kind === kind ? [{ m, price }] : [];
  });

describe("priceGrid over every seeded image and video model", () => {
  it("covers every seeded media model", () => {
    expect(media.length).toBeGreaterThan(10);
  });

  it.each(catalog.prices.filter((p) => media.some((m) => m.id === p.modelId)).map((p) => [p.modelId, p.effectiveFrom, p] as const))(
    "%s from %s: each cell is the price a run at that setting matches, and offered follows priceDims",
    (id, _from, price) => {
      const m = model(id);
      const grid = priceGrid(m, price);
      const dims = priceDims(m);
      expect(grid.cells).toHaveLength(grid.rowValues.length);
      for (const row of grid.cells) expect(row).toHaveLength(grid.colValues.length);
      expect(grid.rowAxis?.key).toBe(m.kind === "image" ? "size" : "resolution");
      const primary = m.kind === "image" ? "output_image" : "video_second";
      for (const row of grid.cells) {
        for (const cell of row) {
          const when = cell.when;
          expect(lineFor(price, primary, when)?.unit_usd ?? null).toBe(cell.usd);
          const offered = Object.entries(when).every(([k, v]) => dims[k]?.includes(v));
          expect(cell.offered).toBe(offered);
          expect(cell.unit).toBe(m.kind === "image" ? "per image" : "per second");
          expect(cell.key).toBe(lineKey(primary, when));
        }
      }
      // Every primary line on the grid's axes is a cell; nothing on the axes is an other charge.
      const axes: string[] = [grid.rowAxis?.key, grid.colAxis?.key].filter((k): k is NonNullable<typeof k> => k !== undefined);
      for (const line of price.lines) {
        const onGrid = line.meter === primary && Object.keys(line.when ?? {}).every((k) => axes.includes(k));
        const inOther = grid.otherCharges.some((o) => o.key === lineKey(line.meter, line.when ?? {}));
        expect(inOther).toBe(!onGrid);
      }
      // A seeded row prices every setting it offers.
      for (const cell of grid.cells.flat()) if (cell.offered) expect(cell.usd).not.toBeNull();
    },
  );

  it("openai images: size rows by aspect, quality columns without auto", () => {
    const g = priceGrid(model("openai:gpt-image-2"), lastPrice("openai:gpt-image-2"));
    expect(g.rowValues.map((v) => [v.value, v.label, v.detail])).toEqual([
      ["1024x1024", "Square", "1024 × 1024"],
      ["1536x1024", "Landscape", "1536 × 1024"],
      ["1024x1536", "Portrait", "1024 × 1536"],
    ]);
    expect(g.colAxis?.key).toBe("quality");
    expect(g.colValues.map((v) => v.label)).toEqual(["Low", "Medium", "High"]);
    expect(g.cells[0][0]).toMatchObject({ usd: 0.006, label: "Square, Low quality, price per image" });
    expect(g.otherCharges.map((o) => [o.label, o.amount])).toEqual([
      ["Per 1M text input tokens", 5],
      ["Per 1M image input tokens", 8],
      ["Per 1M image output tokens", 30],
    ]);
    const big = priceGrid(model("openai:gpt-image-2.5-flare"), lastPrice("openai:gpt-image-2.5-flare"));
    expect(big.colValues.map((v) => v.label)).toEqual(["Low", "Medium", "High", "Extra high", "Max"]);
  });

  it("other images: size rows, one price column", () => {
    const g = priceGrid(model("gemini:gemini-3.1-flash-image"), lastPrice("gemini:gemini-3.1-flash-image"));
    expect(g.rowValues.map((v) => v.label)).toEqual(["512", "1K", "2K", "4K"]);
    expect(g.colAxis).toBeNull();
    expect(g.colValues).toEqual([{ value: null, label: "Price" }]);
    expect(g.cells.map((r) => r[0].usd)).toEqual([0.045, 0.067, 0.101, 0.151]);
    expect(g.cells[1][0].label).toBe("1K, price per image");
  });

  it("video with audio lines: resolution rows by audio columns", () => {
    const g = priceGrid(model("kling:kling-3-0"), lastPrice("kling:kling-3-0"));
    expect(g.rowValues.map((v) => v.label)).toEqual(["720p", "1080p", "4K"]);
    expect(g.colAxis?.key).toBe("audio");
    expect(g.colValues.map((v) => v.label)).toEqual(["With audio", "No audio"]);
    expect(g.cells[0][0]).toMatchObject({ usd: 0.126, label: "720p, audio on, price per second", key: "video_second|audio=true,resolution=720p" });
    expect(g.cells[0][1]).toMatchObject({ usd: 0.084, label: "720p, audio off, price per second" });
    expect(g.otherCharges.map((o) => o.label)).toEqual(["Per Kling unit"]);
  });

  it("video without audio lines: one column, token lines as other charges", () => {
    const g = priceGrid(model("seedance:seedance-2-5"), lastPrice("seedance:seedance-2-5"));
    expect(g.colAxis).toBeNull();
    expect(g.rowValues.map((v) => v.value)).toEqual(["480p", "720p", "1080p"]);
    expect(g.otherCharges.map((o) => [o.label, o.amount, o.perMillion])).toEqual([
      ["Per 1M video output tokens at 1080p", 11.7, true],
      ["Per 1M video output tokens", 10.7, true],
    ]);
  });

  it("marks a setting the model doesn't offer, and an offered setting with no price", () => {
    const m = { ...model("gemini:gemini-nano-banana-2.1") };
    m.params = m.params.map((p) =>
      p.name === "image_size" ? { ...p, constraints: { type: "select" as const, options: ["1K", "2K"] } } : p,
    );
    const price: AiModelPrice = {
      ...lastPrice(m.id),
      lines: [
        { meter: "output_image", unit_usd: 0.03, when: { size: "1K" } },
        { meter: "output_image", unit_usd: 0.1, when: { size: "4K" } },
      ],
    };
    const g = priceGrid(m, price);
    expect(g.rowValues.map((v) => v.value)).toEqual(["1K", "2K", "4K"]);
    expect(g.cells.map((r) => [r[0].offered, r[0].usd])).toEqual([
      [true, 0.03],
      [true, null],
      [false, 0.1],
    ]);
  });

  it("a video model with no resolution setting still shows the resolutions its price names", () => {
    const g = priceGrid(model("kling:kling-o1"), lastPrice("kling:kling-o1"));
    expect(g.rowValues.map((v) => v.value)).toEqual(["720p", "1080p"]);
    expect(g.cells.flat().every((c) => c.offered && c.usd === 0.112)).toBe(true);
  });

  it("other kinds: only other charges", () => {
    for (const id of ["openai:gpt-5.4-mini", "sarvam:dub", "elevenlabs:scribe_v2", "apify:actor", "fal:lipsync-2-pro"]) {
      const g = priceGrid(model(id), lastPrice(id));
      expect(g.rowAxis).toBeNull();
      expect(g.cells).toEqual([]);
      expect(g.otherCharges).toHaveLength(lastPrice(id).lines.length);
    }
    const text = priceGrid(model("openai:gpt-5.4-mini"), lastPrice("openai:gpt-5.4-mini"));
    expect(text.otherCharges.map((o) => [o.label, o.amount])).toEqual([
      ["Per request", 0.005],
      ["Per reference image", 0.0025],
      ["Per 1M input tokens", 0.75],
      ["Per 1M cached input tokens", 0.075],
      ["Per 1M text output tokens", 4.5],
    ]);
    const scrape = priceGrid(model("apify:actor"), lastPrice("apify:actor"));
    expect(scrape.otherCharges[0]).toMatchObject({ atCost: true, label: "Charged at cost" });
  });

  it("line keys round-trip", () => {
    const key = lineKey("video_second", { resolution: "720p", audio: true });
    expect(key).toBe("video_second|audio=true,resolution=720p");
    expect(parseLineKey(key)).toEqual({ meter: "video_second", when: { resolution: "720p", audio: true } });
    expect(parseLineKey(lineKey("request", {}))).toEqual({ meter: "request", when: {} });
  });
});

describe("startingPrice", () => {
  const start = (id: string) => startingPrice(model(id), lastPrice(id));
  it("media: the cheapest offered setting, and whether others cost more", () => {
    expect(start("gemini:gemini-omni-1.2-flash")).toEqual({ kind: "price", usd: 0.023172, unit: "a second", varies: true });
    expect(start("openai:gpt-image-2")).toEqual({ kind: "price", usd: 0.005, unit: "an image", varies: true });
    expect(start("kling:kling-3-0")).toEqual({ kind: "price", usd: 0.084, unit: "a second", varies: true });
  });
  it("one price at every setting", () => {
    expect(start("gemini:gemini-2.5-flash-image")).toEqual({ kind: "price", usd: 0.039, unit: "an image", varies: false });
    expect(start("kling:kling-o1")).toEqual({ kind: "price", usd: 0.112, unit: "a second", varies: false });
  });
  it("other kinds", () => {
    expect(start("sarvam:dub")).toEqual({ kind: "price", usd: expect.closeTo(0.006961122, 9), unit: "a second of audio", varies: false });
    expect(start("openai:gpt-5")).toEqual({ kind: "price", usd: 1.25, unit: "per 1M tokens in", varies: false });
    expect(start("openai:gpt-5.4-mini")).toEqual({ kind: "price", usd: 0.005, unit: "a request", varies: false });
    expect(start("elevenlabs:scribe_v2")).toEqual({ kind: "price", usd: 0.000182, unit: `per ${model("elevenlabs:scribe_v2").providerLabel} credit`, varies: false });
    expect(start("apify:actor")).toEqual({ kind: "at-cost" });
  });
  it("is null with no lines", () => {
    expect(startingPrice(model("sarvam:dub"), { ...lastPrice("sarvam:dub"), lines: [] })).toBeNull();
  });
  it("works for every seeded row", () => {
    for (const kind of ["image", "video", "text", "dub", "voice", "lipsync", "transcribe", "scrape"]) {
      for (const { m, price } of priced(kind)) expect(startingPrice(m, price)).not.toBeNull();
    }
  });
});
